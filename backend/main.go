package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

type SessionInfo struct {
	Username  string
	ExpiresAt time.Time
}

type BlockedIP struct {
	IP             string    `json:"ip"`
	FailedAttempts int       `json:"failed_attempts"`
	LastAttempt    time.Time `json:"last_attempt"`
	BlockExpires   time.Time `json:"block_expires"`
	BlockDuration  int       `json:"block_duration"`
}

var (
	sessionTokens = make(map[string]SessionInfo) // token -> SessionInfo
	sessionMutex  sync.Mutex

	pinSessionTokens = make(map[string]time.Time) // pinToken -> ExpiresAt
	pinSessionMutex  sync.Mutex

	blockedIPsMap   = make(map[string]BlockedIP)
	blockedIPsMutex sync.Mutex
)

func getClientIP(r *http.Request) string {
	xff := r.Header.Get("X-Forwarded-For")
	if xff != "" {
		parts := strings.Split(xff, ",")
		clientIP := strings.TrimSpace(parts[0])
		if clientIP != "" {
			return clientIP
		}
	}

	xri := r.Header.Get("X-Real-IP")
	if xri != "" {
		return strings.TrimSpace(xri)
	}

	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

func checkRateLimit(ip string) (bool, string) {
	blockedIPsMutex.Lock()
	defer blockedIPsMutex.Unlock()

	blockInfo, exists := blockedIPsMap[ip]
	now := time.Now()

	if exists {
		// Enforce hard block if still within block window
		if now.Before(blockInfo.BlockExpires) {
			remaining := int(blockInfo.BlockExpires.Sub(now).Seconds()) + 1
			return false, fmt.Sprintf("Too many failed attempts. IP blocked for %d more seconds.", remaining)
		}

		// Enforce 1-second minimum cooldown between any two attempts
		if now.Sub(blockInfo.LastAttempt) < 1*time.Second {
			return false, "Too fast. Please wait 1 second between attempts."
		}
	}

	return true, ""
}

// registerFailure records a failed attempt and applies exponential block if threshold is reached.
// Returns remaining allowed attempts before a block is applied (0 means a block was just set).
func registerFailure(ip string) int {
	blockedIPsMutex.Lock()
	defer blockedIPsMutex.Unlock()

	maxAttempts := 5
	settings, err := GetSettings()
	if err == nil {
		if val, ok := settings["max_pin_attempts"]; ok {
			if num, err := strconv.Atoi(val); err == nil && num > 0 {
				maxAttempts = num
			}
		}
	}

	blockInfo := blockedIPsMap[ip]
	blockInfo.IP = ip
	blockInfo.FailedAttempts++
	blockInfo.LastAttempt = time.Now()

	remaining := maxAttempts - blockInfo.FailedAttempts

	if blockInfo.FailedAttempts >= maxAttempts {
		exponent := blockInfo.FailedAttempts - maxAttempts
		duration := 10
		if exponent > 0 {
			if exponent > 10 {
				exponent = 10
			}
			duration = 10 * (1 << exponent)
		}
		blockInfo.BlockDuration = duration
		blockInfo.BlockExpires = time.Now().Add(time.Duration(duration) * time.Second)
		remaining = 0
	}

	blockedIPsMap[ip] = blockInfo
	return remaining
}

func registerSuccess(ip string) {
	blockedIPsMutex.Lock()
	defer blockedIPsMutex.Unlock()
	delete(blockedIPsMap, ip)
}

func generateSessionToken() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 10)
	}
	return hex.EncodeToString(b)
}

func generatePinToken() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 10)
	}
	return hex.EncodeToString(b)
}

func isAuthorized(r *http.Request) bool {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return false
	}
	const prefix = "Bearer "
	if len(authHeader) < len(prefix) || authHeader[:len(prefix)] != prefix {
		return false
	}
	token := authHeader[len(prefix):]

	sessionMutex.Lock()
	defer sessionMutex.Unlock()
	session, exists := sessionTokens[token]
	if !exists {
		return false
	}
	if time.Now().After(session.ExpiresAt) {
		delete(sessionTokens, token)
		return false
	}
	
	// Extend admin session by another 30 minutes (sliding window)
	session.ExpiresAt = time.Now().Add(30 * time.Minute)
	sessionTokens[token] = session
	return true
}

func isPinAuthorized(r *http.Request) bool {
	settings, err := GetSettings()
	if err != nil {
		return false
	}
	// If site access PIN is not set in settings, access is open
	if settings["site_pin"] == "" {
		return true
	}

	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return false
	}
	const prefix = "Bearer "
	if len(authHeader) < len(prefix) || authHeader[:len(prefix)] != prefix {
		return false
	}
	token := authHeader[len(prefix):]

	// Admin token is automatically authorized for PIN access if still valid
	sessionMutex.Lock()
	session, isAdmin := sessionTokens[token]
	if isAdmin {
		if time.Now().After(session.ExpiresAt) {
			delete(sessionTokens, token)
			isAdmin = false
		} else {
			// Extend admin session
			session.ExpiresAt = time.Now().Add(30 * time.Minute)
			sessionTokens[token] = session
		}
	}
	sessionMutex.Unlock()
	if isAdmin {
		return true
	}

	// Check PIN session
	pinSessionMutex.Lock()
	defer pinSessionMutex.Unlock()
	expiresAt, exists := pinSessionTokens[token]
	if !exists {
		return false
	}
	if time.Now().After(expiresAt) {
		delete(pinSessionTokens, token)
		return false
	}
	
	// Extend PIN session by another 2 hours (sliding window)
	pinSessionTokens[token] = time.Now().Add(2 * time.Hour)
	return true
}

func startSessionCleanup() {
	ticker := time.NewTicker(10 * time.Minute)
	go func() {
		for range ticker.C {
			now := time.Now()
			
			sessionMutex.Lock()
			for token, session := range sessionTokens {
				if now.After(session.ExpiresAt) {
					delete(sessionTokens, token)
				}
			}
			sessionMutex.Unlock()

			pinSessionMutex.Lock()
			for token, expiresAt := range pinSessionTokens {
				if now.After(expiresAt) {
					delete(pinSessionTokens, token)
				}
			}
			pinSessionMutex.Unlock()
		}
	}()
}

func main() {
	InitDB()
	startSessionCleanup()

	// Expose generated node secret to local node server automatically
	settings, err := GetSettings()
	if err == nil {
		secret := settings["node_secret"]
		if secret != "" {
			_ = os.WriteFile("node_secret.txt", []byte(secret), 0600)
			_ = os.WriteFile("../node/node_secret.txt", []byte(secret), 0600)
		}
	}

	mux := http.NewServeMux()

	// Serve Uploaded Static Files
	mux.Handle("/uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir("./uploads"))))

	// API Endpoints
	mux.HandleFunc("/api/config", handleConfig)
	mux.HandleFunc("/api/nodes", handleNodes)
	mux.HandleFunc("/api/history", handleHistory)
	mux.HandleFunc("/api/login", handleLogin)
	mux.HandleFunc("/api/verify-pin", handleVerifyPin)
	mux.HandleFunc("/api/admin/users", handleAdminUsers)
	mux.HandleFunc("/api/admin/blocked-ips", handleBlockedIPs)
	mux.HandleFunc("/api/upload-logo", handleUploadLogo)

	// Serve Frontend Static Files
	distDir := "./dist"
	if _, err := os.Stat(distDir); err == nil {
		fileServer := http.FileServer(http.Dir(distDir))
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			// Disable caching for frontend files during updates
			w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
			w.Header().Set("Pragma", "no-cache")
			w.Header().Set("Expires", "0")

			path := filepath.Clean(r.URL.Path)
			// Check if file exists, if not serve index.html (for SPA routing)
			if _, err := os.Stat(filepath.Join(distDir, path)); os.IsNotExist(err) {
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
				http.ServeFile(w, r, filepath.Join(distDir, "index.html"))
				return
			}
			fileServer.ServeHTTP(w, r)
		})
	} else {
		// Development or no built frontend
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/plain")
			w.WriteHeader(http.StatusOK)
			fmt.Fprintln(w, "Speedtest Main Backend running. Frontend needs to be built or run in dev mode.")
		})
	}

	// Wrap handler with CORS middleware
	handlerWithCORS := corsMiddleware(mux)

	port := os.Getenv("BACKEND_PORT")
if port == "" {
    if envPort := os.Getenv("PORT"); envPort != "" {
        port = envPort
    } else {
        port = "8080"
    }
}

	log.Printf("Main Backend running on http://localhost:%s", port)
	if err := http.ListenAndServe(":"+port, handlerWithCORS); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// Handler functions
func handleConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		settings, err := GetSettings()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		
		// If the user is not PIN authorized, they only receive minimal locked configuration
		if !isPinAuthorized(r) {
			minimalSettings := map[string]string{
				"site_name":         "Locked Speedtest Portal",
				"site_pin_required": strconv.FormatBool(settings["site_pin"] != ""),
			}
			jsonResponse(w, minimalSettings, http.StatusOK)
			return
		}

		// Secure output: Hide secret fields, send required status indicators
		publicSettings := make(map[string]string)
		for k, v := range settings {
			if k != "admin_password" && k != "site_pin" {
				publicSettings[k] = v
			}
		}
		if isAuthorized(r) {
			publicSettings["site_pin"] = settings["site_pin"]
		}
		publicSettings["site_pin_required"] = strconv.FormatBool(settings["site_pin"] != "")

		jsonResponse(w, publicSettings, http.StatusOK)
		return
	}

	if r.Method == "POST" {
		if !isAuthorized(r) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		var req map[string]string
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		for k, v := range req {
			if k == "admin_password" {
				err := UpdateAdminUserPasswordByName("admin", v)
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				continue
			}
			if err := UpdateSetting(k, v); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}

		settings, _ := GetSettings()
		publicSettings := make(map[string]string)
		for k, v := range settings {
			if k != "admin_password" && k != "site_pin" {
				publicSettings[k] = v
			}
		}
		publicSettings["site_pin_required"] = strconv.FormatBool(settings["site_pin"] != "")

		jsonResponse(w, publicSettings, http.StatusOK)
		return
	}

	http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
}

func handleNodes(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		if !isPinAuthorized(r) {
			http.Error(w, "Unauthorized PIN verification required", http.StatusUnauthorized)
			return
		}
		nodes, err := GetNodes()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		
		settings, _ := GetSettings()
		tokenVal := settings["node_secret"]
		if tokenVal == "" {
			tokenVal = "speedtest-nodes-auth-secure-key-9988"
		}
		for i := range nodes {
			nodes[i].Token = tokenVal
		}
		
		jsonResponse(w, nodes, http.StatusOK)

	case "POST":
		if !isAuthorized(r) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		var n Node
		if err := json.NewDecoder(r.Body).Decode(&n); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}
		if n.Name == "" || n.Address == "" {
			http.Error(w, "Name and Address are required", http.StatusBadRequest)
			return
		}
		id, err := AddNode(n)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		n.ID = id
		jsonResponse(w, n, http.StatusCreated)

	case "DELETE":
		if !isAuthorized(r) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		idStr := r.URL.Query().Get("id")
		if idStr == "" {
			http.Error(w, "Missing id parameter", http.StatusBadRequest)
			return
		}
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			http.Error(w, "Invalid id parameter", http.StatusBadRequest)
			return
		}
		if err := DeleteNode(id); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		jsonResponse(w, map[string]string{"status": "deleted"}, http.StatusOK)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func lookupGeoIP(ip string) (city, isp string) {
	// Skip loopback / private addresses
	if ip == "" || ip == "::1" || ip == "127.0.0.1" {
		return "Localhost", "Local Network"
	}
	// Use ip-api.com free tier (no key needed, 45 req/min)
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(fmt.Sprintf("http://ip-api.com/json/%s?fields=city,isp,status", ip))
	if err != nil {
		return "", ""
	}
	defer resp.Body.Close()
	var result struct {
		Status string `json:"status"`
		City   string `json:"city"`
		ISP    string `json:"isp"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", ""
	}
	if result.Status == "success" {
		return result.City, result.ISP
	}
	return "", ""
}

func handleHistory(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		if !isPinAuthorized(r) {
			http.Error(w, "Unauthorized PIN verification required", http.StatusUnauthorized)
			return
		}
		history, err := GetHistory()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		jsonResponse(w, history, http.StatusOK)

	case "POST":
		if !isPinAuthorized(r) {
			http.Error(w, "Unauthorized PIN verification required", http.StatusUnauthorized)
			return
		}
		var h History
		if err := json.NewDecoder(r.Body).Decode(&h); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Capture client IP from the request
		clientIP := getClientIP(r)
		h.ClientIP = clientIP

		// Best-effort geo lookup (non-blocking)
		h.ClientCity, h.ClientISP = lookupGeoIP(clientIP)

		id, err := SaveHistory(h)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		h.ID = id
		jsonResponse(w, h, http.StatusCreated)

	case "DELETE":
		// Reset all history — admin only
		if !isAuthorized(r) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		if err := DeleteAllHistory(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		jsonResponse(w, map[string]string{"status": "reset"}, http.StatusOK)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func jsonResponse(w http.ResponseWriter, data interface{}, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("Error writing JSON response: %v", err)
	}
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ip := getClientIP(r)
	if ok, errMsg := checkRateLimit(ip); !ok {
		jsonResponse(w, map[string]interface{}{
			"status":  "failed",
			"message": errMsg,
		}, http.StatusTooManyRequests)
		return
	}

	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		registerFailure(ip)
		return
	}

	if req.Username == "" {
		req.Username = "admin" // fallback for backward compatibility
	}

	valid, err := VerifyAdminUser(req.Username, req.Password)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		registerFailure(ip)
		return
	}

	if valid {
		registerSuccess(ip)
		token := generateSessionToken()
		sessionMutex.Lock()
		sessionTokens[token] = SessionInfo{
			Username:  req.Username,
			ExpiresAt: time.Now().Add(30 * time.Minute),
		}
		sessionMutex.Unlock()

		jsonResponse(w, map[string]interface{}{
			"status": "success",
			"token":  token,
		}, http.StatusOK)
	} else {
		remaining := registerFailure(ip)
		var msg string
		if remaining <= 0 {
			msg = "Incorrect credentials. IP address has been temporarily blocked."
		} else {
			msg = fmt.Sprintf("Incorrect username or password. %d attempt(s) remaining.", remaining)
		}
		jsonResponse(w, map[string]interface{}{
			"status":  "failed",
			"message": msg,
		}, http.StatusUnauthorized)
	}
}

func handleVerifyPin(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ip := getClientIP(r)
	if ok, errMsg := checkRateLimit(ip); !ok {
		jsonResponse(w, map[string]interface{}{
			"status":  "failed",
			"message": errMsg,
		}, http.StatusTooManyRequests)
		return
	}

	var req struct {
		Pin string `json:"pin"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		registerFailure(ip)
		return
	}

	settings, err := GetSettings()
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		registerFailure(ip)
		return
	}

	dbPin := settings["site_pin"]
	if dbPin == "" || req.Pin == dbPin {
		registerSuccess(ip)
		token := generatePinToken()
		pinSessionMutex.Lock()
		pinSessionTokens[token] = time.Now().Add(2 * time.Hour)
		pinSessionMutex.Unlock()

		jsonResponse(w, map[string]interface{}{
			"status": "success",
			"token":  token,
		}, http.StatusOK)
	} else {
		remaining := registerFailure(ip)
		var msg string
		if remaining <= 0 {
			msg = "Incorrect PIN. IP address has been temporarily blocked due to too many failed attempts."
		} else {
			msg = fmt.Sprintf("Incorrect PIN. %d attempt(s) remaining before your IP is blocked.", remaining)
		}
		jsonResponse(w, map[string]interface{}{
			"status":  "failed",
			"message": msg,
		}, http.StatusUnauthorized)
	}
}

func handleAdminUsers(w http.ResponseWriter, r *http.Request) {
	if !isAuthorized(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	switch r.Method {
	case "GET":
		users, err := GetAdminUsers()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		jsonResponse(w, users, http.StatusOK)

	case "POST":
		var req struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}
		if req.Username == "" || req.Password == "" {
			http.Error(w, "Username and Password are required", http.StatusBadRequest)
			return
		}
		_, err := AddAdminUser(req.Username, req.Password)
		if err != nil {
			http.Error(w, "Failed to create admin user", http.StatusInternalServerError)
			return
		}
		jsonResponse(w, map[string]string{"status": "success"}, http.StatusCreated)

	case "PUT":
		var req struct {
			ID       int64  `json:"id"`
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}
		if req.ID <= 0 || req.Username == "" {
			http.Error(w, "ID and Username are required", http.StatusBadRequest)
			return
		}
		err := UpdateAdminUser(req.ID, req.Username, req.Password)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		jsonResponse(w, map[string]string{"status": "success"}, http.StatusOK)

	case "DELETE":
		idStr := r.URL.Query().Get("id")
		if idStr == "" {
			http.Error(w, "Missing id parameter", http.StatusBadRequest)
			return
		}
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			http.Error(w, "Invalid id parameter", http.StatusBadRequest)
			return
		}
		if err := DeleteAdminUser(id); err != nil {
			http.Error(w, "Cannot delete the last remaining admin account", http.StatusBadRequest)
			return
		}
		jsonResponse(w, map[string]string{"status": "deleted"}, http.StatusOK)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleBlockedIPs(w http.ResponseWriter, r *http.Request) {
	if !isAuthorized(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	blockedIPsMutex.Lock()
	defer blockedIPsMutex.Unlock()

	switch r.Method {
	case "GET":
		var list []BlockedIP
		for _, v := range blockedIPsMap {
			list = append(list, v)
		}
		if list == nil {
			list = []BlockedIP{}
		}
		jsonResponse(w, list, http.StatusOK)

	case "DELETE":
		ipToUnblock := r.URL.Query().Get("ip")
		if ipToUnblock == "" {
			http.Error(w, "IP address parameter is required", http.StatusBadRequest)
			return
		}
		delete(blockedIPsMap, ipToUnblock)
		jsonResponse(w, map[string]string{"status": "unblocked"}, http.StatusOK)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleUploadLogo(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !isAuthorized(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	uploadsDir := "./uploads"
	if _, err := os.Stat(uploadsDir); os.IsNotExist(err) {
		err := os.Mkdir(uploadsDir, 0755)
		if err != nil {
			http.Error(w, "Failed to create uploads directory", http.StatusInternalServerError)
			return
		}
	}

	err := r.ParseMultipartForm(8 << 20)
	if err != nil {
		http.Error(w, "File too large", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("logo")
	if err != nil {
		http.Error(w, "Missing logo file in request", http.StatusBadRequest)
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	validExtensions := map[string]bool{
		".png":  true,
		".jpg":  true,
		".jpeg": true,
		".gif":  true,
		".svg":  true,
		".ico":  true,
		".webp": true,
	}
	if !validExtensions[ext] {
		http.Error(w, "Unsupported file format. Only images (.png, .jpg, .jpeg, .gif, .svg, .ico, .webp) are allowed.", http.StatusBadRequest)
		return
	}

	filename := fmt.Sprintf("logo_%d%s", time.Now().UnixNano(), ext)
	filePath := filepath.Join(uploadsDir, filename)

	out, err := os.Create(filePath)
	if err != nil {
		http.Error(w, "Failed to save file", http.StatusInternalServerError)
		return
	}
	defer out.Close()

	_, err = io.Copy(out, file)
	if err != nil {
		http.Error(w, "Failed to write file to disk", http.StatusInternalServerError)
		return
	}

	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	logoURL := fmt.Sprintf("%s://%s/uploads/%s", scheme, r.Host, filename)
	
	err = UpdateSetting("logo_url", logoURL)
	if err != nil {
		http.Error(w, "Failed to update logo URL in settings", http.StatusInternalServerError)
		return
	}

	jsonResponse(w, map[string]string{
		"logo_url": logoURL,
		"status":   "success",
	}, http.StatusOK)
}
