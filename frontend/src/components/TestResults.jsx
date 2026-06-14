import React from 'react';
import { ShieldCheck, Activity, Globe, Compass } from 'lucide-react';

const TestResults = ({ results, dnsResults, tracerouteResults }) => {
  if (!results) return null;

  const idlePing = results.ping || 0;
  const dlPing = results.loaded_ping_dl || 0;
  const ulPing = results.loaded_ping_ul || 0;
  
  const dlIncrease = Math.max(0, dlPing - idlePing);
  const ulIncrease = Math.max(0, ulPing - idlePing);
  const totalIncrease = dlIncrease + ulIncrease;

  let bufferbloatGrade = 'A+';
  let bufferbloatDesc = 'Excellent connection health. No buffering under load.';
  let isPoor = false;

  if (totalIncrease > 150) {
    bufferbloatGrade = 'F';
    bufferbloatDesc = 'Severe bufferbloat. Expect gaming lag and freezing video calls when downloading.';
    isPoor = true;
  } else if (totalIncrease > 80) {
    bufferbloatGrade = 'D';
    bufferbloatDesc = 'Poor loaded ping. Bandwidth congestion will noticeably spike your lag.';
    isPoor = true;
  } else if (totalIncrease > 40) {
    bufferbloatGrade = 'C';
    bufferbloatDesc = 'Moderate loaded ping. Heavy downloads might affect real-time apps.';
  } else if (totalIncrease > 15) {
    bufferbloatGrade = 'B';
    bufferbloatDesc = 'Good response times. Very slight latency increases under heavy loads.';
  } else if (totalIncrease > 5) {
    bufferbloatGrade = 'A';
    bufferbloatDesc = 'Very responsive. Minimal delay while loaded.';
  }

  // Calculate scores and warnings for specific activities (0-100 scale)
  const getQualityScore = (activity) => {
    const dl = results.download || 0;
    const ul = results.upload || 0;
    const ping = results.ping || 0;
    const jitter = results.jitter || 0;
    const loss = results.packet_loss || 0;

    let score = 0;
    let label = 'Poor';
    let reason = '';

    switch (activity) {
      case 'gaming':
        if (loss > 2) {
          return { score: 10, label: 'Unusable', reason: `High packet loss (${loss.toFixed(1)}%) causing disconnection.` };
        }
        let gameVal = 100 - (ping * 0.5) - (jitter * 2.0) - (loss * 15.0) - (totalIncrease * 0.3);
        gameVal = Math.max(0, Math.min(100, gameVal));
        score = Math.round(gameVal);
        
        if (score > 85) label = 'Excellent';
        else if (score > 70) label = 'Good';
        else if (score > 50) label = 'Fair';
        else label = 'Poor';

        if (score <= 70) {
          const factors = [];
          if (ping > 35) factors.push(`High latency (${ping.toFixed(0)} ms)`);
          if (jitter > 4) factors.push(`Fluctuating jitter (${jitter.toFixed(1)} ms)`);
          if (loss > 0) factors.push(`Packet drops (${loss.toFixed(1)}%)`);
          if (totalIncrease > 50) factors.push(`Bufferbloat lag (+${totalIncrease.toFixed(0)} ms)`);
          reason = factors.length > 0 ? factors.join(' • ') : "Sub-optimal stability.";
        }
        return { score, label, reason };

      case 'streaming':
        if (dl < 3) {
          return { score: 15, label: 'Low Quality', reason: 'Download speed below 3 Mbps limits resolution.' };
        }
        let streamVal = 50 + (dl * 0.8) - (loss * 10);
        streamVal = Math.max(0, Math.min(100, streamVal));
        score = Math.round(streamVal);

        if (score > 85) label = '4K Ultra HD';
        else if (score > 70) label = '1080p Full HD';
        else if (score > 50) label = '720p HD';
        else label = 'SD Quality';

        if (score <= 70) {
          const factors = [];
          if (dl < 20) factors.push(`Low download rate (${dl.toFixed(1)} Mbps)`);
          if (loss > 0) factors.push(`Packet drops (${loss.toFixed(1)}%)`);
          reason = factors.length > 0 ? factors.join(' • ') : "Congested pipeline.";
        }
        return { score, label, reason };

      case 'conference':
        if (dl < 2 || ul < 2) {
          return { score: 15, label: 'Unusable', reason: 'Insufficient symmetrical bandwidth (<2 Mbps).' };
        }
        let confVal = 100 - (ping * 0.3) - (jitter * 1.5) - (loss * 20) - (Math.max(dlIncrease, ulIncrease) * 0.2);
        confVal = Math.max(0, Math.min(100, confVal));
        score = Math.round(confVal);

        if (score > 85) label = 'HD Symmetrical';
        else if (score > 70) label = 'Good Call';
        else if (score > 50) label = 'Choppy Audio';
        else label = 'Poor Call';

        if (score <= 70) {
          const factors = [];
          if (dl < 8 || ul < 5) factors.push(`Low bandwidth (DL: ${dl.toFixed(1)} / UL: ${ul.toFixed(1)} Mbps)`);
          if (ping > 40) factors.push(`Latency delay (${ping.toFixed(0)} ms)`);
          if (jitter > 3.5) factors.push(`Audio jitter (${jitter.toFixed(1)} ms)`);
          if (loss > 0) factors.push(`Voice packets lost (${loss.toFixed(1)}%)`);
          reason = factors.length > 0 ? factors.join(' • ') : "Routing interference.";
        }
        return { score, label, reason };

      case 'browsing':
      default:
        if (dl < 1) {
          return { score: 10, label: 'Very Slow', reason: 'Extremely limited download bandwidth (<1 Mbps).' };
        }
        let dnsLatency = dnsResults && dnsResults.length > 0 ? dnsResults[0].time_ms : 40;
        let browseVal = 100 - (dnsLatency * 0.25) + (dl * 0.3);
        browseVal = Math.max(0, Math.min(100, browseVal));
        score = Math.round(browseVal);

        if (score > 85) label = 'Instant';
        else if (score > 70) label = 'Fast';
        else if (score > 50) label = 'Average';
        else label = 'Sluggish';

        if (score <= 70) {
          const factors = [];
          if (dl < 10) factors.push(`Low download speed (${dl.toFixed(1)} Mbps)`);
          if (dnsLatency > 80) factors.push(`Slow DNS lookup (${dnsLatency.toFixed(0)} ms)`);
          reason = factors.length > 0 ? factors.join(' • ') : "Slow loading gateways.";
        }
        return { score, label, reason };
    }
  };

  const gamingScore = getQualityScore('gaming');
  const streamingScore = getQualityScore('streaming');
  const confScore = getQualityScore('conference');
  const browsingScore = getQualityScore('browsing');

  return (
    <div className="diagnostic-grid">
      {/* 1. DNS Response Time */}
      <div className="glass-card">
        <h3 className="diagnostic-title">
          <Globe size={18} color="var(--color-download)" />
          DNS Response Time
        </h3>
        <div className="dns-list">
          {dnsResults && dnsResults.length > 0 ? (
            dnsResults.map((dns, idx) => (
              <div key={idx} className="dns-item">
                <div className="dns-info">
                  <span className="dns-name">{dns.server}</span>
                  <span className="dns-ip">{dns.ip}</span>
                </div>
                <span className={`dns-speed ${dns.time_ms > 80 ? 'slow' : dns.time_ms === 0 ? 'failed' : ''}`}>
                  {dns.time_ms === 0 ? 'Failed' : `${dns.time_ms.toFixed(1)} ms`}
                </span>
              </div>
            ))
          ) : (
            <div className="dns-item">
              <span className="dns-name" style={{ color: 'var(--text-dark)' }}>Running DNS benchmark...</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Bufferbloat / Loaded Latency */}
      <div className="glass-card">
        <h3 className="diagnostic-title">
          <Activity size={18} color="var(--color-primary)" />
          Latency Under Load (Bufferbloat)
        </h3>
        <div className="loaded-latency-card">
          <div className="loaded-bar-container">
            <div className="loaded-bar-label">
              <span>Idle Latency</span>
              <span>{results.ping?.toFixed(1)} ms</span>
            </div>
            <div className="loaded-bar-bg">
              <div 
                className="loaded-bar-fill" 
                style={{ width: '100%', background: 'var(--color-ping)' }}
              />
            </div>
          </div>

          <div className="loaded-bar-container">
            <div className="loaded-bar-label">
              <span>Download Loaded Latency</span>
              <span>{results.loaded_ping_dl?.toFixed(1)} ms (+{dlIncrease.toFixed(1)})</span>
            </div>
            <div className="loaded-bar-bg">
              <div 
                className="loaded-bar-fill" 
                style={{ 
                  width: `${Math.min(100, (dlPing / Math.max(1, dlPing + 20)) * 100)}%`, 
                  background: 'var(--color-download)' 
                }}
              />
            </div>
          </div>

          <div className="loaded-bar-container">
            <div className="loaded-bar-label">
              <span>Upload Loaded Latency</span>
              <span>{results.loaded_ping_ul?.toFixed(1)} ms (+{ulIncrease.toFixed(1)})</span>
            </div>
            <div className="loaded-bar-bg">
              <div 
                className="loaded-bar-fill" 
                style={{ 
                  width: `${Math.min(100, (ulPing / Math.max(1, ulPing + 20)) * 100)}%`, 
                  background: 'var(--color-upload)' 
                }}
              />
            </div>
          </div>

          <div className={`loaded-score-badge ${isPoor ? 'poor' : ''}`}>
            Grade: {bufferbloatGrade} • {bufferbloatDesc}
          </div>
        </div>
      </div>

      {/* 3. Connection Quality Score */}
      <div className="glass-card">
        <h3 className="diagnostic-title">
          <ShieldCheck size={18} color="var(--color-upload)" />
          Connection Quality Score
        </h3>
        <div className="scores-grid">
          <div className="score-card">
            <div className="score-header">
              <span className="score-title">Online Gaming</span>
            </div>
            <span className="score-value" style={{ color: gamingScore.score > 70 ? 'var(--color-download)' : 'var(--color-upload)' }}>
              {gamingScore.score}%
            </span>
            <span className="score-desc" style={{ fontWeight: 700 }}>{gamingScore.label}</span>
            {gamingScore.reason && (
              <span style={{ fontSize: '0.72rem', color: '#f87171', marginTop: '0.35rem', lineHeight: '1.25' }}>
                ⚠️ {gamingScore.reason}
              </span>
            )}
          </div>

          <div className="score-card">
            <div className="score-header">
              <span className="score-title">Video Streaming</span>
            </div>
            <span className="score-value" style={{ color: streamingScore.score > 70 ? 'var(--color-download)' : 'var(--color-upload)' }}>
              {streamingScore.score}%
            </span>
            <span className="score-desc" style={{ fontWeight: 700 }}>{streamingScore.label}</span>
            {streamingScore.reason && (
              <span style={{ fontSize: '0.72rem', color: '#f87171', marginTop: '0.35rem', lineHeight: '1.25' }}>
                ⚠️ {streamingScore.reason}
              </span>
            )}
          </div>

          <div className="score-card">
            <div className="score-header">
              <span className="score-title">Video Conference</span>
            </div>
            <span className="score-value" style={{ color: confScore.score > 70 ? 'var(--color-download)' : 'var(--color-upload)' }}>
              {confScore.score}%
            </span>
            <span className="score-desc" style={{ fontWeight: 700 }}>{confScore.label}</span>
            {confScore.reason && (
              <span style={{ fontSize: '0.72rem', color: '#f87171', marginTop: '0.35rem', lineHeight: '1.25' }}>
                ⚠️ {confScore.reason}
              </span>
            )}
          </div>

          <div className="score-card">
            <div className="score-header">
              <span className="score-title">Web Browsing</span>
            </div>
            <span className="score-value" style={{ color: browsingScore.score > 70 ? 'var(--color-download)' : 'var(--color-upload)' }}>
              {browsingScore.score}%
            </span>
            <span className="score-desc" style={{ fontWeight: 700 }}>{browsingScore.label}</span>
            {browsingScore.reason && (
              <span style={{ fontSize: '0.72rem', color: '#f87171', marginTop: '0.35rem', lineHeight: '1.25' }}>
                ⚠️ {browsingScore.reason}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 4. Hop Route Quality Analysis */}
      <div className="glass-card">
        <h3 className="diagnostic-title">
          <Compass size={18} color="var(--color-primary)" />
          Route Quality / Hop Analysis
        </h3>
        <div className="hop-list">
          {tracerouteResults && tracerouteResults.hops && tracerouteResults.hops.length > 0 ? (
            tracerouteResults.hops.map((hop, idx) => (
              <div key={idx} className="hop-item">
                <div className="hop-number">{hop.hop_number}</div>
                <div className="hop-details">
                  <div className="hop-ip-info">
                    <span className="hop-host" title={hop.host}>{hop.host || 'Hop Node'}</span>
                    <span className="hop-ip">{hop.ip}</span>
                  </div>
                  <span className="hop-lat">{hop.latencies[0]}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="hop-item">
              <div className="hop-number">?</div>
              <div className="hop-details">
                <span className="hop-host" style={{ color: 'var(--text-dark)' }}>Running route tracing diagnostic...</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TestResults;
