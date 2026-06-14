import React, { useState, useEffect } from 'react';
import { Settings, Server, Plus, Trash2, Save, Sparkles, TrendingUp, ArrowDownCircle, ArrowUpCircle, Activity, Lock, Image, Shield, RotateCcw, MapPin, Wifi } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const BACKEND_URL = 'http://localhost:8080';

const AdminDashboard = ({
  config,
  onSaveConfig,
  nodes,
  onAddNode,
  onDeleteNode,
  history,
  onResetHistory,
  nodeStatusMap = {},
  onCheckStatus,
  onLogoUploadSuccess,
  adminToken,
  onLogout
}) => {
  const [activeTab, setActiveTab] = useState('settings'); // 'settings' | 'nodes' | 'history' | 'users' | 'blocked-ips'

  // Configuration Form State
  const [siteName, setSiteName] = useState('');
  const [siteDescription, setSiteDescription] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [sitePin, setSitePin] = useState('');
  const [maxPinAttempts, setMaxPinAttempts] = useState('5');

  // Blocked IPs State
  const [blockedIPs, setBlockedIPs] = useState([]);

  // Node Form State
  const [nodeName, setNodeName] = useState('');
  const [nodeAddress, setNodeAddress] = useState('');
  const [nodeCountry, setNodeCountry] = useState('');

  // File Upload State
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Admin Users List State
  const [adminUsers, setAdminUsers] = useState([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [editingUser, setEditingUser] = useState(null); // { id, username }
  const [editPassword, setEditPassword] = useState('');
  const [resettingHistory, setResettingHistory] = useState(false);

  const handleResetHistory = async () => {
    if (!confirm('Are you sure you want to delete ALL speedtest history? This cannot be undone.')) return;
    setResettingHistory(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/history`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      if (res.ok) {
        alert('All speedtest history has been reset successfully.');
        if (onResetHistory) onResetHistory();
      } else {
        const txt = await res.text();
        alert('Error resetting history: ' + txt);
      }
    } catch (err) {
      console.error(err);
      alert('Network error while resetting history.');
    } finally {
      setResettingHistory(false);
    }
  };

  const fetchAdminUsers = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/users`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAdminUsers(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchBlockedIPs = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/blocked-ips`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setBlockedIPs(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUnblockIP = async (ip) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/blocked-ips?ip=${encodeURIComponent(ip)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      if (res.ok) {
        alert(`IP ${ip} has been successfully unblocked.`);
        fetchBlockedIPs();
      } else {
        const txt = await res.text();
        alert('Error: ' + txt);
      }
    } catch (err) {
      console.error(err);
      alert('Network error.');
    }
  };

  useEffect(() => {
    if (adminToken) {
      fetchAdminUsers();
      fetchBlockedIPs();
    }
  }, [adminToken]);

  useEffect(() => {
    if (config) {
      setSiteName(config.site_name || '');
      setSiteDescription(config.site_description || '');
      setSitePin(config.site_pin || '');
      setMaxPinAttempts(config.max_pin_attempts || '5');
    }
  }, [config]);

  const handleConfigSubmit = (e) => {
    e.preventDefault();
    const updates = {
      site_name: siteName,
      site_description: siteDescription,
      site_pin: sitePin,
      max_pin_attempts: maxPinAttempts
    };
    if (adminPassword) {
      updates.admin_password = adminPassword;
    }
    onSaveConfig(updates);
    if (adminPassword) {
      alert('Configurations and default admin password updated successfully!');
      setAdminPassword('');
    } else {
      alert('Branding and PIN configurations saved successfully!');
    }
  };

  const handleNodeSubmit = (e) => {
    e.preventDefault();
    if (!nodeName || !nodeAddress || !nodeCountry) return;
    onAddNode({
      name: nodeName,
      address: nodeAddress,
      country: nodeCountry,
      is_active: true
    });
    setNodeName('');
    setNodeAddress('');
    setNodeCountry('');
  };

  const handleAddAdminUser = async (e) => {
    e.preventDefault();
    if (!newUsername || !newPassword) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ username: newUsername, password: newPassword })
      });
      if (res.ok) {
        alert('Admin user added successfully!');
        setNewUsername('');
        setNewPassword('');
        fetchAdminUsers();
      } else {
        const txt = await res.text();
        alert('Error: ' + txt);
      }
    } catch (err) {
      console.error(err);
      alert('Network error.');
    }
  };

  const handleUpdateAdminUser = async (e) => {
    e.preventDefault();
    if (!editingUser || !editingUser.username) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/users`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          id: editingUser.id,
          username: editingUser.username,
          password: editPassword
        })
      });
      if (res.ok) {
        alert('Admin user updated successfully!');
        setEditingUser(null);
        setEditPassword('');
        fetchAdminUsers();
      } else {
        const txt = await res.text();
        alert('Error: ' + txt);
      }
    } catch (err) {
      console.error(err);
      alert('Network error.');
    }
  };

  const handleDeleteAdminUser = async (id) => {
    if (!confirm('Are you sure you want to delete this admin account?')) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/users?id=${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      if (res.ok) {
        alert('Admin user deleted.');
        fetchAdminUsers();
      } else {
        const txt = await res.text();
        alert('Error deleting user: ' + txt);
      }
    } catch (err) {
      console.error(err);
      alert('Network error.');
    }
  };

  const handleLogoFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingLogo(true);
    const formData = new FormData();
    formData.append('logo', file);

    try {
      const res = await fetch(`${BACKEND_URL}/api/upload-logo`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`
        },
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success') {
          alert('Logo image uploaded successfully!');
          onLogoUploadSuccess(data.logo_url);
        } else {
          alert('Upload failed: ' + data.message);
        }
      } else {
        alert('File upload failed. Ensure the server backend is responsive.');
      }
    } catch (err) {
      console.error(err);
      alert('Upload connection failed.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const getChartData = () => {
    return [...history]
      .reverse()
      .map(item => ({
        name: new Date(item.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        Download: parseFloat(item.download.toFixed(1)),
        Upload: parseFloat(item.upload.toFixed(1)),
        Ping: parseFloat(item.ping.toFixed(0))
      }));
  };

  const getStats = () => {
    if (history.length === 0) return { avgDl: 0, avgUl: 0, avgPing: 0, total: 0 };
    const total = history.length;
    const avgDl = history.reduce((sum, h) => sum + h.download, 0) / total;
    const avgUl = history.reduce((sum, h) => sum + h.upload, 0) / total;
    const avgPing = history.reduce((sum, h) => sum + h.ping, 0) / total;
    return {
      avgDl: avgDl.toFixed(1),
      avgUl: avgUl.toFixed(1),
      avgPing: avgPing.toFixed(0),
      total
    };
  };

  const stats = getStats();

  return (
    <div className="admin-layout">
      {/* Sidebar Navigation */}
      <div className="sidebar-nav">
        <button
          className={`sidebar-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <Settings size={18} />
          Site Configuration
        </button>
        <button
          className={`sidebar-btn ${activeTab === 'nodes' ? 'active' : ''}`}
          onClick={() => setActiveTab('nodes')}
        >
          <Server size={18} />
          Manage Server Nodes
        </button>
        <button
          className={`sidebar-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <TrendingUp size={18} />
          Speedtest Analytics
        </button>
        <button
          className={`sidebar-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <Lock size={18} />
          Admin Accounts
        </button>
        <button
          className={`sidebar-btn ${activeTab === 'blocked-ips' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('blocked-ips');
            fetchBlockedIPs();
          }}
        >
          <Shield size={18} />
          Blocked IPs List
        </button>
        <button
          className="sidebar-btn"
          onClick={onLogout}
          style={{ marginTop: '2rem', color: 'var(--color-danger)' }}
        >
          <Lock size={18} />
          Logout
        </button>
      </div>

      {/* Main Form Dashboard */}
      <div className="glass-card">
        {activeTab === 'settings' && (
          <div>
            <h3 className="diagnostic-title">
              <Settings size={18} color="var(--color-primary)" />
              Site Settings & Customize Branding
            </h3>

            {/* Logo Upload Form */}
            <div className="admin-form-group" style={{ borderBottom: '1px solid var(--border-card)', paddingBottom: '1.5rem', marginBottom: '1.5rem' }}>
              <label className="admin-label">
                <Image size={14} style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} />
                Branding Logo Upload (Favicon will sync with this logo)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoFileChange}
                  style={{ display: 'none' }}
                  id="logo-upload-input"
                />
                <label
                  htmlFor="logo-upload-input"
                  className="admin-btn"
                  style={{ cursor: 'pointer', margin: 0 }}
                >
                  {uploadingLogo ? 'Uploading...' : 'Choose Logo Image'}
                </label>
                {config.logo_url && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <img src={config.logo_url} alt="Logo preview" style={{ height: '36px', width: '36px', borderRadius: '4px', objectFit: 'contain', background: 'rgba(255,255,255,0.05)' }} />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Currently Set</span>
                  </div>
                )}
              </div>
            </div>

            <form onSubmit={handleConfigSubmit}>
              <div className="admin-form-group">
                <label className="admin-label">Website App Title / Brand Name</label>
                <input
                  type="text"
                  className="admin-input"
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  placeholder="e.g. Extreme Speedtest"
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-label">Website Description & Info text</label>
                <textarea
                  className="admin-textarea"
                  value={siteDescription}
                  onChange={(e) => setSiteDescription(e.target.value)}
                  placeholder="Describe your speed test app features..."
                />
              </div>

              <div className="admin-form-group" style={{ borderTop: '1px solid var(--border-card)', paddingTop: '1.5rem', marginTop: '1.5rem' }}>
                <label className="admin-label">Site Access PIN Code (Leave empty to disable PIN lock)</label>
                <input
                  type="text"
                  className="admin-input"
                  value={sitePin}
                  onChange={(e) => setSitePin(e.target.value)}
                  placeholder="e.g. 1234"
                  maxLength={10}
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-label">Max PIN Attempts Lockout Threshold (Multiplier Block 10s, 20s, 40s...)</label>
                <input
                  type="number"
                  className="admin-input"
                  value={maxPinAttempts}
                  onChange={(e) => setMaxPinAttempts(e.target.value)}
                  placeholder="e.g. 5"
                  min="1"
                  max="50"
                  required
                />
              </div>

              <button type="submit" className="admin-btn" style={{ marginTop: '1rem' }}>
                <Save size={16} />
                Save Configurations
              </button>
            </form>
          </div>
        )}

        {activeTab === 'nodes' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 className="diagnostic-title" style={{ margin: 0, border: 0, padding: 0 }}>
                <Server size={18} color="var(--color-download)" />
                Manage Speedtest Node Servers
              </h3>
              <button onClick={onCheckStatus} className="admin-btn" style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }}>
                Recheck All Nodes Status
              </button>
            </div>

            {/* Add New Node Form */}
            <form onSubmit={handleNodeSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
              <div className="admin-form-group" style={{ marginBottom: 0 }}>
                <label className="admin-label">Server / Node Name</label>
                <input
                  type="text"
                  className="admin-input"
                  value={nodeName}
                  onChange={(e) => setNodeName(e.target.value)}
                  placeholder="e.g. Jakarta Node"
                  required
                />
              </div>
              <div className="admin-form-group" style={{ marginBottom: 0 }}>
                <label className="admin-label">Service HTTP Address</label>
                <input
                  type="text"
                  className="admin-input"
                  value={nodeAddress}
                  onChange={(e) => setNodeAddress(e.target.value)}
                  placeholder="http://localhost:8081"
                  required
                />
              </div>
              <div className="admin-form-group" style={{ marginBottom: 0 }}>
                <label className="admin-label">Region / Country</label>
                <input
                  type="text"
                  className="admin-input"
                  value={nodeCountry}
                  onChange={(e) => setNodeCountry(e.target.value)}
                  placeholder="e.g. Indonesia"
                  required
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button type="submit" className="admin-btn" style={{ width: '100%', justifyContent: 'center', height: '45px' }}>
                  <Plus size={16} />
                  Add Server Node
                </button>
              </div>
            </form>

            <h4 style={{ marginBottom: '1rem', fontSize: '0.95rem', fontWeight: 600 }}>Active Servers list</h4>
            <div className="node-grid">
              {nodes.map((node) => {
                const status = nodeStatusMap[node.id] || 'checking';
                return (
                  <div key={node.id} className="node-item">
                    <div className="node-info-main">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span className="node-name-dash">{node.name}</span>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            padding: '0.1rem 0.5rem',
                            borderRadius: '4px',
                            fontWeight: 700,
                            background: status === 'online' ? 'rgba(16, 185, 129, 0.15)' :
                              status === 'offline' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.05)',
                            color: status === 'online' ? 'var(--color-download)' :
                              status === 'offline' ? 'var(--color-danger)' : 'var(--text-dark)'
                          }}
                        >
                          {status.toUpperCase()}
                        </span>
                      </div>
                      <span className="node-addr-dash">{node.address}</span>
                      <span className="node-tag">{node.country}</span>
                    </div>
                    {nodes.length > 1 ? (
                      <button
                        className="btn-delete"
                        onClick={() => onDeleteNode(node.id)}
                        title="Remove Node"
                      >
                        <Trash2 size={16} />
                      </button>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-dark)' }}>Required Node</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <h3 className="diagnostic-title" style={{ margin: 0, border: 0, padding: 0 }}>
                <TrendingUp size={18} color="var(--color-primary)" />
                Speedtest Network Analytics &amp; Performance KPI Summaries
              </h3>
              <button
                onClick={handleResetHistory}
                disabled={resettingHistory || history.length === 0}
                className="admin-btn"
                style={{
                  background: 'rgba(239,68,68,0.1)',
                  color: 'var(--color-danger)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  padding: '0.45rem 1rem',
                  fontSize: '0.82rem',
                  opacity: history.length === 0 ? 0.45 : 1
                }}
              >
                <RotateCcw size={14} style={{ marginRight: '0.35rem' }} />
                {resettingHistory ? 'Resetting...' : 'Reset All History'}
              </button>
            </div>
            {/* KPI Cards section */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
              <div className="score-card" style={{ background: 'rgba(16, 185, 129, 0.03)' }}>
                <span className="score-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ArrowDownCircle size={14} color="var(--color-download)" />
                  Avg Download
                </span>
                <span className="score-value" style={{ color: 'var(--color-download)' }}>{stats.avgDl} <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>Mbps</span></span>
              </div>
              <div className="score-card" style={{ background: 'rgba(245, 158, 11, 0.03)' }}>
                <span className="score-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ArrowUpCircle size={14} color="var(--color-upload)" />
                  Avg Upload
                </span>
                <span className="score-value" style={{ color: 'var(--color-upload)' }}>{stats.avgUl} <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>Mbps</span></span>
              </div>
              <div className="score-card" style={{ background: 'rgba(59, 130, 246, 0.03)' }}>
                <span className="score-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Activity size={14} color="var(--color-ping)" />
                  Avg Ping / Latency
                </span>
                <span className="score-value" style={{ color: 'var(--color-ping)' }}>{stats.avgPing} <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>ms</span></span>
              </div>
              <div className="score-card" style={{ background: 'rgba(139, 92, 246, 0.03)' }}>
                <span className="score-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Sparkles size={14} color="var(--color-primary)" />
                  Total Tests
                </span>
                <span className="score-value" style={{ color: 'var(--color-primary)' }}>{stats.total} <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>Runs</span></span>
              </div>
            </div>

            {history.length > 0 ? (
              <div style={{ height: 260, marginBottom: '2rem', background: 'rgba(255,255,255,0.01)', borderRadius: 12, padding: '1rem', border: '1px solid var(--border-card)' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={getChartData()}>
                    <defs>
                      <linearGradient id="colorDl" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-download)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--color-download)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorUl" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-upload)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--color-upload)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" tick={{ fill: 'var(--text-dark)', fontSize: 9 }} />
                    <YAxis tick={{ fill: 'var(--text-dark)', fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: '#0f172a', borderColor: 'var(--border-card)', color: '#fff' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="Download" stroke="var(--color-download)" strokeWidth={2} fillOpacity={1} fill="url(#colorDl)" />
                    <Area type="monotone" dataKey="Upload" stroke="var(--color-upload)" strokeWidth={2} fillOpacity={1} fill="url(#colorUl)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', border: '1px dashed var(--border-card)', borderRadius: '12px', color: 'var(--text-dark)', marginBottom: '2rem' }}>
                Run speedtests from the home page to populate the performance trending charts.
              </div>
            )}

            <div className="history-table-container">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Server</th>
                    <th><MapPin size={11} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />Client IP</th>
                    <th>Location</th>
                    <th><Wifi size={11} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />Provider (ISP)</th>
                    <th>Download</th>
                    <th>Upload</th>
                    <th>Ping</th>
                    <th>Loss</th>
                    <th>Bufferbloat DL/UL</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        {new Date(h.timestamp).toLocaleString()}
                      </td>
                      <td>{h.node_name}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {h.client_ip || <span style={{ color: 'var(--text-dark)' }}>—</span>}
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>
                        {h.client_city || <span style={{ color: 'var(--text-dark)' }}>—</span>}
                      </td>
                      <td style={{ fontSize: '0.78rem', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {h.client_isp || <span style={{ color: 'var(--text-dark)' }}>—</span>}
                      </td>
                      <td style={{ color: 'var(--color-download)', fontWeight: 700 }}>{h.download.toFixed(1)} Mbps</td>
                      <td style={{ color: 'var(--color-upload)', fontWeight: 700 }}>{h.upload.toFixed(1)} Mbps</td>
                      <td>{h.ping.toFixed(0)} ms</td>
                      <td style={{ color: h.packet_loss > 0 ? 'var(--color-danger)' : 'inherit' }}>{h.packet_loss.toFixed(1)}%</td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {h.loaded_ping_dl.toFixed(0)} ms / {h.loaded_ping_ul.toFixed(0)} ms
                      </td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr>
                      <td colSpan="10" style={{ textAlign: 'center', color: 'var(--text-dark)', padding: '2rem' }}>
                        No test history results found. Perform tests to log details.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div>
            <h3 className="diagnostic-title">
              <Lock size={18} color="var(--color-primary)" />
              Manage Admin Dashboard Users
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', marginBottom: '2rem' }}>
              <form onSubmit={handleAddAdminUser} className="glass-card" style={{ padding: '1.25rem', border: '1px solid var(--border-card)' }}>
                <h4 style={{ marginBottom: '1rem', fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-primary)' }}>Add New Admin</h4>
                <div className="admin-form-group">
                  <label className="admin-label">Username</label>
                  <input
                    type="text"
                    className="admin-input"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="Enter new username"
                    required
                  />
                </div>
                <div className="admin-form-group">
                  <label className="admin-label">Password</label>
                  <input
                    type="password"
                    className="admin-input"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter password"
                    required
                  />
                </div>
                <button type="submit" className="admin-btn" style={{ width: '100%', justifyContent: 'center', marginTop: '1rem' }}>
                  <Plus size={16} /> Add Account
                </button>
              </form>

              {editingUser ? (
                <form onSubmit={handleUpdateAdminUser} className="glass-card" style={{ padding: '1.25rem', borderColor: 'var(--color-primary)' }}>
                  <h4 style={{ marginBottom: '1rem', fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-upload)' }}>Edit Admin: {editingUser.username}</h4>
                  <div className="admin-form-group">
                    <label className="admin-label">Username</label>
                    <input
                      type="text"
                      className="admin-input"
                      value={editingUser.username}
                      onChange={(e) => setEditingUser({ ...editingUser, username: e.target.value })}
                      required
                    />
                  </div>
                  <div className="admin-form-group">
                    <label className="admin-label">New Password (Leave blank to keep same)</label>
                    <input
                      type="password"
                      className="admin-input"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      placeholder="Enter new password"
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                    <button type="submit" className="admin-btn" style={{ flex: 1, justifyContent: 'center' }}>
                      Save Changes
                    </button>
                    <button type="button" className="admin-btn" onClick={() => { setEditingUser(null); setEditPassword(''); }} style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)', border: '1px solid var(--border-card)' }}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="glass-card" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--border-card)' }}>
                  <span style={{ color: 'var(--text-dark)', fontSize: '0.85rem' }}>Select an admin account from the table to modify their details.</span>
                </div>
              )}
            </div>

            <h4 style={{ marginBottom: '1rem', fontSize: '0.95rem', fontWeight: 600 }}>Active Administrator Accounts</h4>
            <div className="history-table-container">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Username</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {adminUsers.map((u) => (
                    <tr key={u.id}>
                      <td>{u.id}</td>
                      <td style={{ fontWeight: 600 }}>{u.username}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                          <button
                            className="admin-btn"
                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--color-upload)', border: '1px solid rgba(245, 158, 11, 0.2)' }}
                            onClick={() => setEditingUser(u)}
                          >
                            Edit
                          </button>
                          {adminUsers.length > 1 && (
                            <button
                              className="btn-delete"
                              style={{ padding: '0.35rem' }}
                              onClick={() => handleDeleteAdminUser(u.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'blocked-ips' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 className="diagnostic-title" style={{ margin: 0, border: 0, padding: 0 }}>
                <Shield size={18} color="var(--color-danger)" />
                Rate-Limited & Blocked Client IPs
              </h3>
              <button 
                onClick={fetchBlockedIPs} 
                className="admin-btn" 
                style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }}
              >
                Refresh List
              </button>
            </div>

            <div className="history-table-container">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Client IP Address</th>
                    <th>Failed Attempts</th>
                    <th>Last Attempt</th>
                    <th>Lock Expiration</th>
                    <th>Active Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {blockedIPs.map((block) => {
                    const isStillBlocked = new Date(block.block_expires) > new Date();
                    return (
                      <tr key={block.ip}>
                        <td style={{ fontWeight: 700 }}>{block.ip}</td>
                        <td style={{ color: 'var(--color-danger)', fontWeight: 600 }}>{block.failed_attempts}</td>
                        <td>{new Date(block.last_attempt).toLocaleString()}</td>
                        <td>{new Date(block.block_expires).toLocaleString()}</td>
                        <td>
                          <span 
                            style={{
                              fontSize: '0.75rem',
                              padding: '0.1rem 0.5rem',
                              borderRadius: '4px',
                              fontWeight: 700,
                              background: isStillBlocked ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                              color: isStillBlocked ? 'var(--color-danger)' : 'var(--color-download)'
                            }}
                          >
                            {isStillBlocked ? 'BLOCKED' : 'EXPIRED'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button 
                            className="admin-btn" 
                            style={{ 
                              padding: '0.35rem 0.75rem', 
                              fontSize: '0.75rem', 
                              background: 'rgba(16, 185, 129, 0.1)', 
                              color: 'var(--color-download)', 
                              border: '1px solid rgba(16, 185, 129, 0.2)' 
                            }}
                            onClick={() => handleUnblockIP(block.ip)}
                          >
                            Unblock IP
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {blockedIPs.length === 0 && (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-dark)', padding: '2rem' }}>
                        No blocked or rate-limited IP addresses found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
