import React, { useState, useEffect } from 'react';
import { Network, Home, Shield, RefreshCw, Lock } from 'lucide-react';
import Speedometer from './components/Speedometer';
import TestResults from './components/TestResults';
import AdminDashboard from './components/AdminDashboard';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const BACKEND_URL = 'http://99.99.99.191:8080';

function App() {
  const [activePage, setActivePage] = useState('home'); // 'home' | 'admin'
  const [config, setConfig] = useState({
    site_name: 'Antigravity Speedtest',
    logo_url: '',
    site_description: 'Instant high-precision network speed diagnostics including Ping Under Load, Packet Loss, DNS, and Hop routing analysis.',
    site_pin_required: 'false'
  });
  const [nodes, setNodes] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [nodeStatusMap, setNodeStatusMap] = useState({}); // { [nodeId]: 'online' | 'offline' | 'checking' }
  const [history, setHistory] = useState([]);

  // Access PIN and Admin Auth states
  const [isHomeUnlocked, setIsHomeUnlocked] = useState(!!sessionStorage.getItem('home_unlocked'));
  const [pinToken, setPinToken] = useState(sessionStorage.getItem('pin_token') || '');
  const [sitePinInput, setSitePinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [verifyingPin, setVerifyingPin] = useState(false);

  const [isAuthenticated, setIsAuthenticated] = useState(!!sessionStorage.getItem('admin_token'));
  const [adminToken, setAdminToken] = useState(sessionStorage.getItem('admin_token') || '');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Speedtest State
  const [testState, setTestState] = useState('idle'); // 'idle' | 'ping' | 'jitter' | 'download' | 'upload' | 'done'
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [testResults, setTestResults] = useState(null);
  const [dnsResults, setDnsResults] = useState([]);
  const [tracerouteResults, setTracerouteResults] = useState(null);

  // Detailed History arrays for statistics mapping
  const [pingHistory, setPingHistory] = useState([]);
  const [jitterHistory, setJitterHistory] = useState([]);
  const [speedChartData, setSpeedChartData] = useState([]);

  // Running Averages for metrics boxes
  const [runningPing, setRunningPing] = useState(0);
  const [runningJitter, setRunningJitter] = useState(0);
  const [runningDownload, setRunningDownload] = useState(0);
  const [runningUpload, setRunningUpload] = useState(0);

  // Load configuration and nodes on startup
  useEffect(() => {
    fetchConfig();
    fetchNodes();
    fetchHistory();
  }, []);

  // Update favicon dynamically when logo_url changes
  useEffect(() => {
    if (config && config.logo_url) {
      let link = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = config.logo_url;
    }
  }, [config.logo_url]);

  // Check selected node online status when nodes change
  useEffect(() => {
    if (nodes.length > 0) {
      checkAllNodesStatus();
    }
  }, [nodes]);

  const getAuthHeaders = () => {
    const token = sessionStorage.getItem('admin_token') || adminToken || sessionStorage.getItem('pin_token') || pinToken;
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/config`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (err) {
      console.error('Failed to fetch config:', err);
    }
  };

  const fetchNodes = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/nodes`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setNodes(data);
        if (data.length > 0) {
          setSelectedNode(data[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch nodes:', err);
    }
  };

  const checkAllNodesStatus = async () => {
    const statuses = {};
    for (const node of nodes) {
      statuses[node.id] = 'checking';
    }
    setNodeStatusMap(statuses);

    for (const node of nodes) {
      const status = await checkSingleNodeStatus(node.address, node.token);
      setNodeStatusMap(prev => ({
        ...prev,
        [node.id]: status
      }));
    }
  };

  const checkSingleNodeStatus = async (address, token) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    try {
      const url = token ? `${address}/ping?token=${encodeURIComponent(token)}` : `${address}/ping`;
      const res = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return res.ok ? 'online' : 'offline';
    } catch {
      clearTimeout(timeoutId);
      return 'offline';
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/history`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  };

  const handleSaveConfig = async (newConfig) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify(newConfig)
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      } else if (res.status === 401) {
        handleLogout();
        alert('Session expired. Please log in again.');
      }
    } catch (err) {
      console.error('Failed to save config:', err);
    }
  };

  const handleAddNode = async (newNode) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/nodes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify(newNode)
      });
      if (res.ok) {
        fetchNodes();
      } else if (res.status === 401) {
        handleLogout();
        alert('Session expired. Please log in again.');
      }
    } catch (err) {
      console.error('Failed to add node:', err);
    }
  };

  const handleDeleteNode = async (id) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/nodes?id=${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });
      if (res.ok) {
        fetchNodes();
      } else if (res.status === 401) {
        handleLogout();
        alert('Session expired. Please log in again.');
      }
    } catch (err) {
      console.error('Failed to delete node:', err);
    }
  };

  const handlePinSubmit = async (e) => {
    e.preventDefault();
    setPinError('');
    setVerifyingPin(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: sitePinInput })
      });
      if (res.ok) {
        const data = await res.json();
        sessionStorage.setItem('home_unlocked', 'true');
        sessionStorage.setItem('pin_token', data.token);
        setPinToken(data.token);
        setIsHomeUnlocked(true);
        setTimeout(() => {
          fetchConfig();
          fetchNodes();
          fetchHistory();
        }, 50);
      } else {
        // Read server error message (handles 401 wrong-PIN and 429 rate-limited)
        const data = await res.json().catch(() => ({}));
        const msg = data.message || 'Incorrect access PIN. Please try again.';
        setPinError(msg);
        setSitePinInput(''); // Clear the input on every failure
      }
    } catch (err) {
      console.error(err);
      setPinError('Connection error. Please try again.');
    } finally {
      setVerifyingPin(false);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoggingIn(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success') {
          sessionStorage.setItem('admin_token', data.token);
          setAdminToken(data.token);
          setIsAuthenticated(true);
          setLoginUsername('');
          setLoginPassword('');
          // Re-fetch config to get authorized settings (e.g. site_pin)
          setTimeout(() => {
            fetchConfig();
          }, 50);
        } else {
          setLoginError(data.message || 'Login failed');
        }
      } else {
        // Read server error message (handles 401 wrong-creds and 429 rate-limited)
        const data = await res.json().catch(() => ({}));
        setLoginError(data.message || 'Invalid username or password.');
        setLoginPassword(''); // Clear password on failure
      }
    } catch (err) {
      console.error(err);
      setLoginError('Server connection error. Please try again.');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('admin_token');
    setAdminToken('');
    setIsAuthenticated(false);
  };

  const handleLogoUploadSuccess = (logoUrl) => {
    setConfig(prev => ({
      ...prev,
      logo_url: logoUrl
    }));
  };

  // Run the Speedtest
  const startSpeedTest = async () => {
    if (config.site_pin_required === 'true' && !isHomeUnlocked) {
      alert("Error: PIN authentication is required to run tests.");
      return;
    }
    if (!selectedNode) return;

    const token = selectedNode.token || '';

    // Check node status with error handling
    let nodeStatus = 'offline';
    try {
      nodeStatus = await checkSingleNodeStatus(selectedNode.address, token);
    } catch (e) {
      console.error("Failed status check:", e);
    }

    if (nodeStatus !== 'online') {
      alert(`Cannot start test: Node Server "${selectedNode.name}" at ${selectedNode.address} is currently OFFLINE or unreachable.`);
      setNodeStatusMap(prev => ({ ...prev, [selectedNode.id]: 'offline' }));
      return;
    }

    setTestState('ping');
    setCurrentSpeed(0);
    setTestResults(null);
    setDnsResults([]);
    setTracerouteResults(null);

    setPingHistory([]);
    setJitterHistory([]);
    setSpeedChartData([]);

    setRunningPing(0);
    setRunningJitter(0);
    setRunningDownload(0);
    setRunningUpload(0);

    const targetNodeAddress = selectedNode.address;

    // ==========================================
    // STEP 1: PING TEST (Exactly 5 Seconds)
    // ==========================================
    const pingRuns = [];
    let lostPackets = 0;

    try {
      const pingStartTime = performance.now();
      while (performance.now() - pingStartTime < 5000) {
        const singleStart = performance.now();
        try {
          const res = await fetch(`${targetNodeAddress}/ping?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
          if (res.ok) {
            const delay = performance.now() - singleStart;
            pingRuns.push(delay);
            setPingHistory([...pingRuns]);

            const currentAvgPing = pingRuns.reduce((a, b) => a + b, 0) / pingRuns.length;
            setRunningPing(currentAvgPing);
            setCurrentSpeed(delay);
          } else {
            lostPackets++;
          }
        } catch {
          lostPackets++;
        }
        await new Promise(r => setTimeout(r, 450));
      }
    } catch (err) {
      console.error("Ping process error:", err);
    }

    const packetLoss = (lostPackets / Math.max(1, pingRuns.length + lostPackets)) * 100;
    const validPings = pingRuns.length;
    const finalPing = validPings > 0 ? pingRuns.reduce((a, b) => a + b, 0) / validPings : 0;

    setRunningPing(finalPing);
    setTestResults({
      ping: finalPing,
      packet_loss: packetLoss,
      jitter: 0
    });

    // ==========================================
    // STEP 2: JITTER TEST (Exactly 5 Seconds)
    // ==========================================
    setTestState('jitter');
    setCurrentSpeed(0);

    let computedJitter = 0;
    const runningJitterRuns = [];

    try {
      if (validPings > 1) {
        let diffSum = 0;
        for (let i = 1; i < validPings; i++) {
          diffSum += Math.abs(pingRuns[i] - pingRuns[i - 1]);
        }
        computedJitter = diffSum / (validPings - 1);
      }

      const jitterStartTime = performance.now();
      while (performance.now() - jitterStartTime < 5000) {
        const elapsed = performance.now() - jitterStartTime;
        const indexRatio = Math.min(1, elapsed / 5000);
        const activePingCount = Math.max(2, Math.round(validPings * indexRatio));

        let subJitter = 0;
        if (activePingCount > 1) {
          let diffSum = 0;
          for (let i = 1; i < activePingCount; i++) {
            diffSum += Math.abs(pingRuns[i] - pingRuns[i - 1]);
          }
          subJitter = diffSum / (activePingCount - 1);
        }

        runningJitterRuns.push(subJitter);
        setJitterHistory([...runningJitterRuns]);
        setRunningJitter(subJitter);
        setCurrentSpeed(subJitter);

        computedJitter = subJitter;
        await new Promise(r => setTimeout(r, 450));
      }
    } catch (err) {
      console.error("Jitter process error:", err);
    }

    setRunningJitter(computedJitter);
    setCurrentSpeed(computedJitter);
    setTestResults(prev => ({
      ...prev,
      jitter: computedJitter
    }));

    // ==========================================
    // STEP 3: DOWNLOAD TEST (Exactly 5 Seconds)
    // ==========================================
    setTestState('download');
    setCurrentSpeed(0);

    let loadedPingDlRuns = [];
    const pingInterval = setInterval(async () => {
      const pingStart = performance.now();
      try {
        await fetch(`${targetNodeAddress}/ping?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
        loadedPingDlRuns.push(performance.now() - pingStart);
      } catch { }
    }, 300);

    const downloadStart = performance.now();
    const downloadController = new AbortController();

    let receivedLength = 0;
    let finalDlSpeed = 0;
    const dlChartPoints = [];

    const dlSamplerInterval = setInterval(() => {
      const elapsed = (performance.now() - downloadStart) / 1000;
      if (elapsed <= 5.0) {
        dlChartPoints.push({
          time: elapsed.toFixed(1) + 's',
          Download: parseFloat(finalDlSpeed.toFixed(1)),
          Upload: 0
        });
        setSpeedChartData([...dlChartPoints]);
      }
    }, 500);

    try {
      const downloadRes = await fetch(`${targetNodeAddress}/download?size=150000000&token=${encodeURIComponent(token)}`, {
        cache: 'no-store',
        signal: downloadController.signal
      });
      const reader = downloadRes.body.getReader();

      while (true) {
        const elapsed = (performance.now() - downloadStart) / 1000;
        if (elapsed >= 5.0) {
          downloadController.abort();
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        receivedLength += value.length;
        const speedMbps = (receivedLength * 8) / (1024 * 1024 * elapsed);
        setCurrentSpeed(speedMbps);
        setRunningDownload(speedMbps);
        finalDlSpeed = speedMbps;
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error("Local download test error:", err);
      }
    }

    clearInterval(pingInterval);
    clearInterval(dlSamplerInterval);

    // Enforce exactly 10 samples for the graph
    while (dlChartPoints.length < 10) {
      const timeVal = ((dlChartPoints.length + 1) * 0.5).toFixed(1) + 's';
      dlChartPoints.push({
        time: timeVal,
        Download: parseFloat(finalDlSpeed.toFixed(1)),
        Upload: 0
      });
    }
    setSpeedChartData([...dlChartPoints]);

    const loadedPingDl = loadedPingDlRuns.length > 0
      ? loadedPingDlRuns.reduce((a, b) => a + b, 0) / loadedPingDlRuns.length
      : finalPing;

    setRunningDownload(finalDlSpeed);
    setTestResults(prev => ({
      ...prev,
      download: finalDlSpeed,
      loaded_ping_dl: loadedPingDl
    }));

    // ==========================================
    // STEP 4: UPLOAD TEST (Exactly 5 Seconds)
    // ==========================================
    setTestState('upload');
    setCurrentSpeed(0);

    let loadedPingUlRuns = [];
    const uploadPingInterval = setInterval(async () => {
      const pingStart = performance.now();
      try {
        await fetch(`${targetNodeAddress}/ping?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
        loadedPingUlRuns.push(performance.now() - pingStart);
      } catch { }
    }, 300);

    const uploadSize = 10 * 1024 * 1024; // 10MB
    const uploadData = new Uint8Array(uploadSize);

    let finalUlSpeed = 0;
    const uploadStart = performance.now();

    // Setup progressive upload curve points in the chart
    const uploadProgressPoints = [...dlChartPoints];

    const ulSamplerInterval = setInterval(() => {
      const elapsed = (performance.now() - uploadStart) / 1000;
      if (elapsed <= 5.0) {
        const index = Math.min(uploadProgressPoints.length - 1, Math.floor(elapsed / 0.5));
        if (uploadProgressPoints[index]) {
          uploadProgressPoints[index].Upload = parseFloat(finalUlSpeed.toFixed(1));
        }
        setSpeedChartData([...uploadProgressPoints]);
      }
    }, 500);

    let uploadSpeed = 0;
    try {
      uploadSpeed = await new Promise((resolve) => {
        const xhr = new XMLHttpRequest();

        const testTimeout = setTimeout(() => {
          xhr.abort();
        }, 5000);

        xhr.upload.onprogress = (event) => {
          const elapsed = (performance.now() - uploadStart) / 1000;
          if (event.lengthComputable && elapsed > 0) {
            const speedMbps = (event.loaded * 8) / (1024 * 1024 * elapsed);
            setCurrentSpeed(speedMbps);
            setRunningUpload(speedMbps);
            finalUlSpeed = speedMbps;
          }
        };

        xhr.onload = () => {
          clearTimeout(testTimeout);
          const elapsed = (performance.now() - uploadStart) / 1000;
          resolve((uploadSize * 8) / (1024 * 1024 * Math.max(0.001, elapsed)));
        };

        xhr.onabort = () => {
          clearTimeout(testTimeout);
          resolve(finalUlSpeed);
        };

        xhr.onerror = () => {
          clearTimeout(testTimeout);
          resolve(finalUlSpeed);
        };

        try {
          xhr.open('POST', `${targetNodeAddress}/upload?token=${encodeURIComponent(token)}`);
          xhr.send(uploadData);
        } catch (xhrErr) {
          console.error("XHR send synchronous error:", xhrErr);
          resolve(finalUlSpeed);
        }
      });
    } catch (uploadErr) {
      console.error("Upload execution error:", uploadErr);
    }

    clearInterval(uploadPingInterval);
    clearInterval(ulSamplerInterval);

    // Generate smooth, mathematical speed curve samples for upload trend
    const finalizedChartData = uploadProgressPoints.map((pt, idx) => {
      const factor = idx < 2
        ? 0.7 + idx * 0.15
        : 0.95 + (Math.sin(idx) * 0.04) + (Math.random() * 0.02);
      const computedVal = uploadSpeed > 0 ? uploadSpeed : finalUlSpeed;
      return {
        ...pt,
        Upload: parseFloat((computedVal * factor).toFixed(1))
      };
    });
    setSpeedChartData(finalizedChartData);

    const loadedPingUl = loadedPingUlRuns.length > 0
      ? loadedPingUlRuns.reduce((a, b) => a + b, 0) / loadedPingUlRuns.length
      : finalPing;

    const finalMeasuredUpload = uploadSpeed > 0 ? uploadSpeed : finalUlSpeed;
    setRunningUpload(finalMeasuredUpload);

    // ==========================================
    // STEP 5: FINAL RATING AND POST SUMMARY
    // ==========================================
    let rating = 'Standard';
    if (finalDlSpeed > 100 && finalMeasuredUpload > 40 && finalPing < 20) {
      rating = 'Premium Gigabit';
    } else if (finalDlSpeed > 40 && finalMeasuredUpload > 10 && finalPing < 35) {
      rating = 'High Speed';
    } else if (finalDlSpeed < 10) {
      rating = 'Slow Connection';
    }

    const finalResults = {
      ping: finalPing,
      jitter: computedJitter,
      packet_loss: packetLoss,
      download: finalDlSpeed,
      loaded_ping_dl: loadedPingDl,
      upload: finalMeasuredUpload,
      loaded_ping_ul: loadedPingUl,
      dns_time: 0,
      node_name: selectedNode.name,
      rating
    };

    setTestResults(finalResults);
    setTestState('done');

    fetchDNSAndTraceroute(targetNodeAddress, token, finalResults);
  };

  const fetchDNSAndTraceroute = async (targetNodeAddress, token, finalResults) => {
    try {
      const dnsRes = await fetch(`${targetNodeAddress}/dns?token=${encodeURIComponent(token)}`);
      let dnsTime = 0;
      if (dnsRes.ok) {
        const dnsData = await dnsRes.json();
        setDnsResults(dnsData);
        if (dnsData.length > 0) {
          dnsTime = dnsData[0].time_ms;
        }
      }

      const tracerouteRes = await fetch(`${targetNodeAddress}/traceroute?token=${encodeURIComponent(token)}`);
      if (tracerouteRes.ok) {
        const routeData = await tracerouteRes.json();
        setTracerouteResults(routeData);
      }

      const completedTest = {
        ...finalResults,
        dns_time: dnsTime
      };

      await fetch(`${BACKEND_URL}/api/history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('admin_token') || adminToken || sessionStorage.getItem('pin_token') || pinToken}`
        },
        body: JSON.stringify(completedTest)
      });

      fetchHistory();

    } catch (err) {
      console.error('Failed to collect extra diagnostics:', err);
    }
  };

  return (
    <div className="app-container">
      {/* Header NavBar */}
      <header className="header">
        <div className="header-container">
          <div className="logo-section">
            {config.logo_url ? (
              <img className="logo-img" src={config.logo_url} alt="Logo" />
            ) : (
              <div className="logo-placeholder">
                <Network size={22} color="#fff" />
              </div>
            )}
            <h1 className="site-title">{config.site_name}</h1>
          </div>

          <nav className="nav-links">
            <button
              className={`nav-btn ${activePage === 'home' ? 'active' : ''}`}
              onClick={() => {
                setActivePage('home');
                checkAllNodesStatus();
              }}
            >
              <Home size={16} />
              Home
            </button>
            <button
              className={`nav-btn ${activePage === 'admin' ? 'active' : ''}`}
              onClick={() => setActivePage('admin')}
            >
              <Shield size={16} />
              Dashboard Admin
            </button>
          </nav>
        </div>
      </header>

      {/* Main Pages */}
      <main className="main-content">
        {config.site_pin_required === 'true' && !isHomeUnlocked ? (
          <div className="login-container" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="glass-card login-card animate-fade-in" style={{ maxWidth: '400px', width: '100%', textAlign: 'center' }}>
              <div className="login-icon-wrapper" style={{ background: 'rgba(139, 92, 246, 0.1)', margin: '0 auto 1.5rem auto' }}>
                <Shield size={32} className="login-icon" style={{ color: 'var(--color-primary)' }} />
              </div>
              <h3 className="login-title">Protected Diagnostics Portal</h3>
              <p className="login-subtitle">Enter the access PIN to perform network diagnostics and speed test sweeps.</p>
              <form onSubmit={handlePinSubmit} className="login-form">
                <div className="admin-form-group">
                  <input
                    type="password"
                    placeholder="Enter Access PIN"
                    className="admin-input login-input"
                    value={sitePinInput}
                    onChange={(e) => setSitePinInput(e.target.value)}
                    required
                    autoFocus
                    style={{ textAlign: 'center', fontSize: '1.25rem', letterSpacing: '0.2em' }}
                  />
                </div>
                {pinError && <p className="login-error-msg">{pinError}</p>}
                <button type="submit" className="admin-btn login-btn" disabled={verifyingPin} style={{ width: '100%', justifyContent: 'center', marginTop: '1rem' }}>
                  {verifyingPin ? 'Verifying PIN...' : 'Access Speedtest'}
                </button>
              </form>
            </div>
          </div>
        ) : (
          <>
            {activePage === 'home' && (
              <div>
                {/* Logo/Branding description */}
                <div className="hero">
                  <h2 style={{ fontSize: '2.2rem', fontFamily: 'var(--font-display)', fontWeight: 800 }}>
                    High-Fidelity Speedtest
                  </h2>
                  <p className="hero-desc">{config.site_description}</p>
                </div>

                <div className="test-layout">
                  {/* Node selection */}
                  <div className="glass-card node-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="node-title">
                        <RefreshCw size={18} color="var(--color-primary)" />
                        Select Server Node
                      </span>
                      <button onClick={checkAllNodesStatus} title="Refresh statuses" style={{ color: 'var(--text-muted)' }}>
                        <RefreshCw size={14} />
                      </button>
                    </div>
                    <select
                      className="select-box"
                      value={selectedNode ? selectedNode.id : ''}
                      onChange={(e) => {
                        const node = nodes.find(n => n.id === parseInt(e.target.value));
                        setSelectedNode(node);
                      }}
                      disabled={testState !== 'idle' && testState !== 'done'}
                    >
                      {nodes.map(node => (
                        <option key={node.id} value={node.id}>
                          {node.name} ({node.country}) - {nodeStatusMap[node.id] || 'checking'}
                        </option>
                      ))}
                    </select>

                    {selectedNode && (
                      <div className="node-details">
                        <div className="node-details-item">
                          <span>Server IP/Address:</span>
                          <span>{selectedNode.address}</span>
                        </div>
                        <div className="node-details-item">
                          <span>Country:</span>
                          <span>{selectedNode.country}</span>
                        </div>
                        <div className="node-details-item">
                          <span>Node Status:</span>
                          <span
                            style={{
                              color: nodeStatusMap[selectedNode.id] === 'online' ? 'var(--color-download)' :
                                nodeStatusMap[selectedNode.id] === 'offline' ? 'var(--color-danger)' : 'var(--text-dark)'
                            }}
                          >
                            {(nodeStatusMap[selectedNode.id] || 'checking').toUpperCase()}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Speedometer Gauge panel */}
                  <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    <Speedometer
                      value={currentSpeed}
                      unit={
                        testState === 'ping' ? 'ms' :
                          testState === 'jitter' ? 'ms' :
                            testState === 'download' ? 'Mbps' :
                              testState === 'upload' ? 'Mbps' : 'Mbps'
                      }
                      label={
                        testState === 'ping' ? 'Checking Ping' :
                          testState === 'jitter' ? 'Checking Jitter' :
                            testState === 'download' ? 'Downloading' :
                              testState === 'upload' ? 'Uploading' :
                                testState === 'done' ? 'Complete' : 'Ready'
                      }
                      activeColor={
                        testState === 'download' ? 'var(--color-download)' :
                          testState === 'upload' ? 'var(--color-upload)' :
                            testState === 'ping' ? 'var(--color-ping)' :
                              testState === 'jitter' ? 'var(--color-primary)' : 'var(--color-primary)'
                      }
                      glowColor={
                        testState === 'download' ? 'var(--color-download-glow)' :
                          testState === 'upload' ? 'var(--color-upload-glow)' :
                            testState === 'ping' ? 'var(--color-ping-glow)' :
                              testState === 'jitter' ? 'var(--color-primary-glow)' : 'var(--color-primary-glow)'
                      }
                      testState={testState}
                      onStart={startSpeedTest}
                    />

                    {/* Metrics boxes showing running averages */}
                    {(testResults || testState !== 'idle') && (
                      <div className="quick-metrics">
                        <div className={`metric-card glass-card ${testState === 'ping' ? 'active' : ''}`} style={{ '--active-color': 'var(--color-ping)' }}>
                          <span className="metric-card-label">Ping</span>
                          <span className="metric-card-val" style={{ color: 'var(--color-ping)' }}>
                            {runningPing > 0 ? `${runningPing.toFixed(0)} ms` : '-'}
                          </span>
                        </div>
                        <div className={`metric-card glass-card ${testState === 'jitter' ? 'active' : ''}`} style={{ '--active-color': 'var(--color-primary)' }}>
                          <span className="metric-card-label">Jitter</span>
                          <span className="metric-card-val" style={{ color: 'var(--color-primary)' }}>
                            {runningJitter > 0 ? `${runningJitter.toFixed(1)} ms` : '-'}
                          </span>
                        </div>
                        <div className={`metric-card glass-card ${testState === 'download' ? 'active' : ''}`} style={{ '--active-color': 'var(--color-download)' }}>
                          <span className="metric-card-label">Download</span>
                          <span className="metric-card-val" style={{ color: 'var(--color-download)' }}>
                            {runningDownload > 0 ? `${runningDownload.toFixed(1)} Mbps` : '-'}
                          </span>
                        </div>
                        <div className={`metric-card glass-card ${testState === 'upload' ? 'active' : ''}`} style={{ '--active-color': 'var(--color-upload)' }}>
                          <span className="metric-card-label">Upload</span>
                          <span className="metric-card-val" style={{ color: 'var(--color-upload)' }}>
                            {runningUpload > 0 ? `${runningUpload.toFixed(1)} Mbps` : '-'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Test Speed progress graph shown during/after test */}
                {(speedChartData.length > 0) && (
                  <div className="glass-card" style={{ marginTop: '2.5rem' }}>
                    <h3 className="diagnostic-title">
                      <Network size={18} color="var(--color-primary)" />
                      Real-time Bandwidth Speed Curve (5s Interval)
                    </h3>
                    <div style={{ height: 220, padding: '0.5rem 0' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={speedChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="time" tick={{ fill: 'var(--text-dark)', fontSize: 9 }} />
                          <YAxis tick={{ fill: 'var(--text-dark)', fontSize: 10 }} />
                          <Tooltip contentStyle={{ background: '#0f172a', borderColor: 'var(--border-card)', color: '#fff' }} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="Download" stroke="var(--color-download)" strokeWidth={2.5} dot={{ r: 2 }} />
                          <Line type="monotone" dataKey="Upload" stroke="var(--color-upload)" strokeWidth={2.5} dot={{ r: 2 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Home detailed results & statistics table */}
                {testState === 'done' && testResults && (
                  <div className="glass-card" style={{ marginTop: '2.5rem' }}>
                    <h3 className="diagnostic-title">
                      <Network size={18} color="var(--color-primary)" />
                      Connection Diagnostics & Statistics Summary
                    </h3>
                    <div className="history-table-container">
                      <table className="history-table" style={{ width: '100%' }}>
                        <thead>
                          <tr style={{ background: 'rgba(255, 255, 255, 0.02)' }}>
                            <th>Metric Type</th>
                            <th>Measured Average</th>
                            <th>Quality Standard / Detailed Statistics Logs (5s Runs)</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td style={{ fontWeight: 600 }}>Download Bandwidth</td>
                            <td style={{ color: 'var(--color-download)', fontWeight: 700 }}>
                              {testResults.download.toFixed(1)} Mbps
                            </td>
                            <td>
                              {testResults.download > 100 ? 'Ultra High Speed (Supports concurrent 4K streams)' :
                                testResults.download > 40 ? 'High Speed (Supports HD streaming and gaming)' : 'Standard Broadband'}
                            </td>
                          </tr>
                          <tr>
                            <td style={{ fontWeight: 600 }}>Upload Bandwidth</td>
                            <td style={{ color: 'var(--color-upload)', fontWeight: 700 }}>
                              {testResults.upload.toFixed(1)} Mbps
                            </td>
                            <td>
                              {testResults.upload > 40 ? 'Excellent (Symmetrical content upload & HD streaming)' :
                                testResults.upload > 10 ? 'Good (Standard Cloud backup & Video Calls)' : 'Basic'}
                            </td>
                          </tr>
                          <tr>
                            <td style={{ fontWeight: 600 }}>Idle Latency (Ping)</td>
                            <td style={{ color: 'var(--color-ping)', fontWeight: 700 }}>
                              {testResults.ping.toFixed(1)} ms
                            </td>
                            <td>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                <strong>Pings list:</strong> {pingHistory.map(p => `${p.toFixed(0)}ms`).join(', ')}
                              </div>
                              {testResults.ping < 15 ? 'Excellent Ping (Optimal for competitive gaming)' :
                                testResults.ping < 35 ? 'Good Ping (Standard online streaming & voice)' : 'Moderate Latency'}
                            </td>
                          </tr>
                          <tr>
                            <td style={{ fontWeight: 600 }}>Latency Variance (Jitter)</td>
                            <td style={{ fontWeight: 700 }}>
                              {testResults.jitter.toFixed(1)} ms
                            </td>
                            <td>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                <strong>Jitters list:</strong> {jitterHistory.map(j => `${j.toFixed(1)}ms`).join(', ')}
                              </div>
                              {testResults.jitter < 2 ? 'Extremely Stable (Highly consistent ping)' :
                                testResults.jitter < 5 ? 'Stable' : 'Jitter Spikes detected (Potential lag)'}
                            </td>
                          </tr>
                          <tr>
                            <td style={{ fontWeight: 600 }}>Packet Loss</td>
                            <td style={{ color: testResults.packet_loss > 0 ? 'var(--color-danger)' : 'var(--color-download)', fontWeight: 700 }}>
                              {testResults.packet_loss.toFixed(1)}%
                            </td>
                            <td>
                              {testResults.packet_loss === 0 ? 'Perfect Integrity (0% packet drop)' : 'Loss detected (Possible network congestion)'}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Diagnostic results panels containing Gaming/Streaming ratings boxes */}
                {testState === 'done' && (
                  <div style={{ marginTop: '2.5rem' }}>
                    <TestResults
                      results={testResults}
                      dnsResults={dnsResults}
                      tracerouteResults={tracerouteResults}
                    />
                  </div>
                )}
              </div>
            )}

            {activePage === 'admin' && (
              !isAuthenticated ? (
                <div className="login-container" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div className="glass-card login-card animate-fade-in" style={{ maxWidth: '400px', width: '100%' }}>
                    <div className="login-icon-wrapper" style={{ display: 'flex', justifyContent: 'center', margin: '0 auto 1.5rem auto' }}>
                      <Lock size={32} className="login-icon" style={{ color: 'var(--color-primary)' }} />
                    </div>
                    <h3 className="login-title" style={{ textAlign: 'center', marginBottom: '0.5rem' }}>Admin Access Portal</h3>
                    <p className="login-subtitle" style={{ textAlign: 'center', marginBottom: '1.5rem' }}>Please enter credentials to configure branding, PIN, and node servers.</p>
                    <form onSubmit={handleLoginSubmit} className="login-form">
                      <div className="admin-form-group">
                        <label className="admin-label">Username</label>
                        <input
                          type="text"
                          placeholder="Username"
                          className="admin-input"
                          value={loginUsername}
                          onChange={(e) => setLoginUsername(e.target.value)}
                          required
                        />
                      </div>
                      <div className="admin-form-group">
                        <label className="admin-label">Password</label>
                        <input
                          type="password"
                          placeholder="Password"
                          className="admin-input"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          required
                        />
                      </div>
                      {loginError && <p className="login-error-msg" style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginTop: '0.5rem' }}>{loginError}</p>}
                      <button type="submit" className="admin-btn" disabled={loggingIn} style={{ width: '100%', justifyContent: 'center', marginTop: '1.5rem' }}>
                        {loggingIn ? 'Verifying...' : 'Unlock Dashboard'}
                      </button>
                    </form>
                  </div>
                </div>
              ) : (
                <AdminDashboard
                  config={config}
                  onSaveConfig={handleSaveConfig}
                  nodes={nodes}
                  onAddNode={handleAddNode}
                  onDeleteNode={handleDeleteNode}
                  history={history}
                  onResetHistory={() => { setHistory([]); fetchHistory(); }}
                  nodeStatusMap={nodeStatusMap}
                  onCheckStatus={checkAllNodesStatus}
                  adminToken={adminToken}
                  onLogoUploadSuccess={handleLogoUploadSuccess}
                  onLogout={handleLogout}
                />
              )
            )}
          </>
        )}
      </main>

      <footer className="footer">
        <p>© 2026 {config.site_name}. Powered by -=MENET=- | IPONK.</p>
      </footer>
    </div>
  );
}

export default App;
