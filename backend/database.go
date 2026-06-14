package main

import (
	"crypto/rand"
	"encoding/hex"
	"database/sql"
	"log"
	"os"
	"time"

	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
)

func generateRandomToken(length int) string {
	b := make([]byte, length/2)
	if _, err := rand.Read(b); err != nil {
		return "fallback-node-secret-key-12345"
	}
	return hex.EncodeToString(b)
}

func hashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(bytes), err
}

var db *sql.DB

type Setting struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type Node struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Address  string `json:"address"`
	Country  string `json:"country"`
	IsActive bool   `json:"is_active"`
	Token    string `json:"token,omitempty"`
}

type History struct {
	ID          int64   `json:"id"`
	Timestamp   string  `json:"timestamp"`
	Download    float64 `json:"download"`
	Upload      float64 `json:"upload"`
	Ping        float64 `json:"ping"`
	Jitter      float64 `json:"jitter"`
	PacketLoss  float64 `json:"packet_loss"`
	LoadedPingDl float64 `json:"loaded_ping_dl"`
	LoadedPingUl float64 `json:"loaded_ping_ul"`
	DNSTime     float64 `json:"dns_time"`
	NodeName    string  `json:"node_name"`
	Rating      string  `json:"rating"`
	ClientIP    string  `json:"client_ip"`
	ClientCity  string  `json:"client_city"`
	ClientISP   string  `json:"client_isp"`
}

type AdminUser struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
	Password string `json:"password,omitempty"`
}

func InitDB() {
	var err error
	db, err = sql.Open("sqlite", "./speedtest.db")
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}

	// Create tables
	queries := []string{
		`CREATE TABLE IF NOT EXISTS settings (
			key TEXT PRIMARY KEY,
			value TEXT
		);`,
		`CREATE TABLE IF NOT EXISTS nodes (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			address TEXT NOT NULL,
			country TEXT NOT NULL,
			is_active INTEGER DEFAULT 1
		);`,
		`CREATE TABLE IF NOT EXISTS history (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			timestamp TEXT NOT NULL,
			download REAL NOT NULL,
			upload REAL NOT NULL,
			ping REAL NOT NULL,
			jitter REAL NOT NULL,
			packet_loss REAL NOT NULL,
			loaded_ping_dl REAL NOT NULL,
			loaded_ping_ul REAL NOT NULL,
			dns_time REAL NOT NULL,
			node_name TEXT NOT NULL,
			rating TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS admin_users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT UNIQUE NOT NULL,
			password TEXT NOT NULL
		);`,
	}

	for _, query := range queries {
		if _, err := db.Exec(query); err != nil {
			log.Fatalf("Error creating table: %v", err)
		}
	}

	// Migrate existing history table: add new columns if they don't exist
	migrations := []string{
		`ALTER TABLE history ADD COLUMN client_ip TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE history ADD COLUMN client_city TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE history ADD COLUMN client_isp TEXT NOT NULL DEFAULT ''`,
	}
	for _, m := range migrations {
		// SQLite returns an error if column already exists; just ignore it
		_, _ = db.Exec(m)
	}

	// Insert default settings
	sitePin := "1234"
	if envPin := os.Getenv("ADMIN_PIN"); envPin != "" {
		sitePin = envPin
	}

	defaultSettings := map[string]string{
		"site_name":        "Antigravity Speedtest",
		"logo_url":         "",
		"site_description": "Instant high-precision network speed diagnostics including Ping Under Load, Packet Loss, DNS, and Hop routing analysis.",
		"site_pin":         sitePin,
		"node_secret":      generateRandomToken(32),
		"max_pin_attempts": "5",
	}

	for k, v := range defaultSettings {
		var existing string
		err := db.QueryRow("SELECT value FROM settings WHERE key = ?", k).Scan(&existing)
		if err == sql.ErrNoRows {
			_, err = db.Exec("INSERT INTO settings (key, value) VALUES (?, ?)", k, v)
			if err != nil {
				log.Printf("Failed to insert setting %s: %v", k, err)
			}
		}
	}

	// Overwrite site_pin if ADMIN_PIN is explicitly set in env
	if envPin := os.Getenv("ADMIN_PIN"); envPin != "" {
		_, err = db.Exec("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", "site_pin", envPin)
		if err != nil {
			log.Printf("Failed to update site_pin from env: %v", err)
		}
	}

	// Overwrite node_secret if NODE_SECRET is explicitly set in env
	if envSecret := os.Getenv("NODE_SECRET"); envSecret != "" {
		_, err = db.Exec("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", "node_secret", envSecret)
		if err != nil {
			log.Printf("Failed to update node_secret from env: %v", err)
		}
	}

	// Insert default admin user if none exist
	var userCount int
	err = db.QueryRow("SELECT COUNT(*) FROM admin_users").Scan(&userCount)
	if err == nil && userCount == 0 {
		adminPass := "admin"
		if envPass := os.Getenv("ADMIN_PASSWORD"); envPass != "" {
			adminPass = envPass
		}
		hashedPass, err := hashPassword(adminPass)
		if err == nil {
			_, err = db.Exec("INSERT INTO admin_users (username, password) VALUES (?, ?)", "admin", hashedPass)
			if err != nil {
				log.Printf("Failed to insert default admin user: %v", err)
			}
		} else {
			log.Printf("Failed to hash default admin user password: %v", err)
		}
	} else if envPass := os.Getenv("ADMIN_PASSWORD"); envPass != "" {
		// Overwrite password for 'admin' user if ADMIN_PASSWORD is set in env
		hashedPass, err := hashPassword(envPass)
		if err == nil {
			_, err = db.Exec("UPDATE admin_users SET password = ? WHERE username = ?", hashedPass, "admin")
			if err != nil {
				log.Printf("Failed to update admin password from env: %v", err)
			}
		}
	}

	// Insert default local speedtest node if none exist
	var count int
	err = db.QueryRow("SELECT COUNT(*) FROM nodes").Scan(&count)
	if err == nil && count == 0 {
		_, err = db.Exec("INSERT INTO nodes (name, address, country, is_active) VALUES (?, ?, ?, ?)",
			"Local Test Server", "http://localhost:8081", "Localhost", 1)
		if err != nil {
			log.Printf("Failed to insert default node: %v", err)
		}
		_, err = db.Exec("INSERT INTO nodes (name, address, country, is_active) VALUES (?, ?, ?, ?)",
			"Secondary Test Server", "http://localhost:8082", "Alternative Node", 1)
		if err != nil {
			log.Printf("Failed to insert secondary node: %v", err)
		}
	}
}

// Settings Helpers
func GetSettings() (map[string]string, error) {
	rows, err := db.Query("SELECT key, value FROM settings")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	settings := make(map[string]string)
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			return nil, err
		}
		settings[key] = value
	}
	return settings, nil
}

func UpdateSetting(key, value string) error {
	_, err := db.Exec("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", key, value)
	return err
}

// Nodes Helpers
func GetNodes() ([]Node, error) {
	rows, err := db.Query("SELECT id, name, address, country, is_active FROM nodes")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var nodes []Node
	for rows.Next() {
		var n Node
		var isActive int
		if err := rows.Scan(&n.ID, &n.Name, &n.Address, &n.Country, &isActive); err != nil {
			return nil, err
		}
		n.IsActive = isActive == 1
		nodes = append(nodes, n)
	}
	return nodes, nil
}

func AddNode(n Node) (int64, error) {
	isActiveInt := 0
	if n.IsActive {
		isActiveInt = 1
	}
	res, err := db.Exec("INSERT INTO nodes (name, address, country, is_active) VALUES (?, ?, ?, ?)",
		n.Name, n.Address, n.Country, isActiveInt)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func DeleteNode(id int64) error {
	_, err := db.Exec("DELETE FROM nodes WHERE id = ?", id)
	return err
}

// History Helpers
func GetHistory() ([]History, error) {
	rows, err := db.Query(`SELECT id, timestamp, download, upload, ping, jitter, packet_loss,
		loaded_ping_dl, loaded_ping_ul, dns_time, node_name, rating,
		client_ip, client_city, client_isp
		FROM history ORDER BY id DESC LIMIT 500`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var histories []History
	for rows.Next() {
		var h History
		if err := rows.Scan(
			&h.ID, &h.Timestamp, &h.Download, &h.Upload, &h.Ping, &h.Jitter, &h.PacketLoss,
			&h.LoadedPingDl, &h.LoadedPingUl, &h.DNSTime, &h.NodeName, &h.Rating,
			&h.ClientIP, &h.ClientCity, &h.ClientISP,
		); err != nil {
			return nil, err
		}
		histories = append(histories, h)
	}
	return histories, nil
}

func SaveHistory(h History) (int64, error) {
	if h.Timestamp == "" {
		h.Timestamp = time.Now().Format(time.RFC3339)
	}
	res, err := db.Exec(`INSERT INTO history (
		timestamp, download, upload, ping, jitter, packet_loss,
		loaded_ping_dl, loaded_ping_ul, dns_time, node_name, rating,
		client_ip, client_city, client_isp
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		h.Timestamp, h.Download, h.Upload, h.Ping, h.Jitter, h.PacketLoss,
		h.LoadedPingDl, h.LoadedPingUl, h.DNSTime, h.NodeName, h.Rating,
		h.ClientIP, h.ClientCity, h.ClientISP)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func DeleteAllHistory() error {
	_, err := db.Exec("DELETE FROM history")
	return err
}

// Admin Users Helpers
func GetAdminUsers() ([]AdminUser, error) {
	rows, err := db.Query("SELECT id, username FROM admin_users")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []AdminUser
	for rows.Next() {
		var u AdminUser
		if err := rows.Scan(&u.ID, &u.Username); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, nil
}

func AddAdminUser(username, password string) (int64, error) {
	hashed, err := hashPassword(password)
	if err != nil {
		return 0, err
	}
	res, err := db.Exec("INSERT INTO admin_users (username, password) VALUES (?, ?)", username, hashed)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func UpdateAdminUser(id int64, username, password string) error {
	if password != "" {
		hashed, err := hashPassword(password)
		if err != nil {
			return err
		}
		_, err = db.Exec("UPDATE admin_users SET username = ?, password = ? WHERE id = ?", username, hashed, id)
		return err
	}
	_, err := db.Exec("UPDATE admin_users SET username = ? WHERE id = ?", username, id)
	return err
}

func UpdateAdminUserPasswordByName(username, password string) error {
	hashed, err := hashPassword(password)
	if err != nil {
		return err
	}
	_, err = db.Exec("UPDATE admin_users SET password = ? WHERE username = ?", hashed, username)
	return err
}

func DeleteAdminUser(id int64) error {
	var count int
	err := db.QueryRow("SELECT COUNT(*) FROM admin_users").Scan(&count)
	if err != nil {
		return err
	}
	if count <= 1 {
		return sql.ErrTxDone // prevent locking out
	}
	_, err = db.Exec("DELETE FROM admin_users WHERE id = ?", id)
	return err
}

func VerifyAdminUser(username, password string) (bool, error) {
	var dbPassword string
	err := db.QueryRow("SELECT password FROM admin_users WHERE username = ?", username).Scan(&dbPassword)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}

	// Bcrypt hashes start with $2a$, $2b$, or $2y$
	isHashed := len(dbPassword) >= 6 && (dbPassword[:4] == "$2a$" || dbPassword[:4] == "$2b$" || dbPassword[:4] == "$2y$")
	if isHashed {
		err = bcrypt.CompareHashAndPassword([]byte(dbPassword), []byte(password))
		return err == nil, nil
	}

	// Plaintext fallback with auto-migration
	if dbPassword == password {
		hashed, err := hashPassword(password)
		if err == nil {
			_, _ = db.Exec("UPDATE admin_users SET password = ? WHERE username = ?", hashed, username)
		}
		return true, nil
	}

	return false, nil
}

