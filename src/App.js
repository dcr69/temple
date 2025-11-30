import React, { useState, useEffect, useRef, useCallback } from 'react';
import html2canvas from 'html2canvas';
import liff from '@line/liff';
import './App.css';
import { CONFIG, FORTUNES } from './data';

// 圖片資源
const IMG_LOGO = '/r69.png'; 
const IMG_TENGA = '/toss.png'; 

function App() {
  // === State 管理 ===
  const [view, setView] = useState('login'); // login, machine, result, cooldown
  const [currentUser, setCurrentUser] = useState(null);
  const [fortune, setFortune] = useState(null);
  const [cooldownTime, setCooldownTime] = useState(0);
  const [historyResult, setHistoryResult] = useState(''); // 修正 1: 這會被用到
  
  // 輸入框 State
  const [guestName, setGuestName] = useState('');
  const [linePhone, setLinePhone] = useState('');

  // 彈窗 State
  const [activeModal, setActiveModal] = useState(null); 

  // Ref
  const captureRef = useRef(null);

  // === 邏輯函式 (使用 useCallback 包裹以解決依賴警告) ===

  // 進入機器 & 檢查冷卻
  const enterMachine = useCallback(async (user) => {
    try {
      setView('machine');
      
      const res = await fetch(CONFIG.GOOGLE_SCRIPT_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: 'check', id: user.id })
      });
      const data = await res.json();

      if (data.status === 'cooldown') {
        setCooldownTime(data.remaining);
        setHistoryResult(data.history || '讀取中...');
        
        const lastFortune = FORTUNES.find(f => f.id === data.fortuneId) || { 
            id: "??", type: "未知", title: "資料讀取中", knowledge: "...", reminder: "..." 
        };
        setFortune(lastFortune);
        setView('cooldown');
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  // 驗證 Discord 用戶
  const verifyDiscordUser = useCallback(async (token) => {
    try {
      const res = await fetch('https://discord.com/api/users/@me', { headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Token Invalid');
      const user = await res.json();
      const avatar = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : `https://cdn.discordapp.com/embed/avatars/0.png`;
      
      const userData = { id: user.id, username: user.username, avatar, loginType: 'discord' };
      setCurrentUser(userData);
      enterMachine(userData);
    } catch {
      localStorage.removeItem('r69_access_token');
      setView('login');
    }
  }, [enterMachine]);

  // 處理 Discord 回調
  const handleDiscordCallback = useCallback((token) => {
    localStorage.setItem('r69_access_token', token);
    window.history.pushState(null, null, ' ');
    verifyDiscordUser(token);
  }, [verifyDiscordUser]);

  // 處理 LINE 用戶
  const handleLineUser = useCallback(async () => {
    try {
      const profile = await liff.getProfile();
      const storedPhone = localStorage.getItem('r69_temp_phone');
      const userData = {
        id: profile.userId,
        username: profile.displayName,
        avatar: profile.pictureUrl,
        loginType: 'line',
        phone: storedPhone
      };
      setCurrentUser(userData);
      localStorage.removeItem('r69_temp_phone');
      enterMachine(userData);
    } catch (err) {
      alert('LINE Login Failed');
    }
  }, [enterMachine]);

  // === 初始化 Effect (修正 2: 加入依賴) ===
  useEffect(() => {
    const initApp = async () => {
      // 1. 檢查 Discord 回調
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      if (fragment.get('access_token')) {
        handleDiscordCallback(fragment.get('access_token'));
        return;
      }

      // 2. 檢查 LocalStorage Token
      const storedToken = localStorage.getItem('r69_access_token');
      if (storedToken) {
        verifyDiscordUser(storedToken);
        return;
      }

      // 3. 讀取暫存手機
      const storedPhone = localStorage.getItem('r69_temp_phone');
      if (storedPhone) setLinePhone(storedPhone);

      // 4. 初始化 LINE LIFF
      try {
        await liff.init({ liffId: CONFIG.MY_LIFF_ID });
        if (liff.isLoggedIn()) {
          handleLineUser();
        }
      } catch (err) {
        console.error('LIFF Init Error', err);
      }
    };

    initApp();
  }, [handleDiscordCallback, verifyDiscordUser, handleLineUser]);

  // === 倒數計時器 ===
  useEffect(() => {
    let timer;
    if (view === 'cooldown' && cooldownTime > 0) {
      timer = setInterval(() => {
        setCooldownTime((prev) => {
          if (prev <= 1000) {
            window.location.reload();
            return 0;
          }
          return prev - 1000;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [view, cooldownTime]);

  // === 其他互動函式 ===

  const handleDiscordLogin = () => {
    window.location.href = `https://discord.com/oauth2/authorize?client_id=${CONFIG.DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(CONFIG.REDIRECT_URI)}&response_type=token&scope=identify%20guilds`;
  };

  const handleLineLoginBtn = () => {
    if (!/^09\d{8}$/.test(linePhone)) {
      alert("請輸入正確的手機號碼 (09xxxxxxxx，共10碼)");
      return;
    }
    localStorage.setItem('r69_temp_phone', linePhone);
    if (!liff.isLoggedIn()) {
      liff.login();
    } else {
      handleLineUser();
    }
  };

  const handleGuestLogin = () => {
    if (!guestName.trim()) {
      alert('請輸入您的暱稱');
      return;
    }
    const userObj = {
      id: 'guest_' + guestName,
      username: guestName,
      avatar: 'https://cdn.discordapp.com/embed/avatars/0.png',
      loginType: 'guest'
    };
    setCurrentUser(userObj);
    enterMachine({ id: userObj.id });
  };

  const drawFortune = () => {
    const btn = document.getElementById('draw-btn');
    if(btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 求籤中...';
    }
    
    const stickIcon = document.getElementById('stick-icon');
    if(stickIcon) stickIcon.classList.add('shaking');

    const randomIndex = Math.floor(Math.random() * FORTUNES.length);
    const newFortune = FORTUNES[randomIndex];

    setTimeout(() => {
        if(stickIcon) stickIcon.classList.remove('shaking');
        
        if(currentUser) {
            fetch(CONFIG.GOOGLE_SCRIPT_URL, {
                method: 'POST', mode: 'no-cors',
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({
                    action: 'save', 
                    id: currentUser.id, 
                    name: currentUser.username, 
                    phone: currentUser.phone || '', 
                    result: `[${newFortune.type}] ${newFortune.title}`, 
                    fortuneId: newFortune.id, 
                    type: newFortune.type, 
                    loginType: currentUser.loginType,
                    title: newFortune.title, 
                    knowledge: newFortune.knowledge, 
                    reminder: newFortune.reminder
                })
            }).catch(e => console.error(e));
        }

        setFortune(newFortune);
        setView('result');
    }, 800);
  };

  const downloadImage = () => {
    if (!captureRef.current) return;
    const btn = document.getElementById('dl-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 處理中...';
    btn.disabled = true;

    html2canvas(captureRef.current, { scale: 3, backgroundColor: '#ffffff', useCORS: true, allowTaint: true }).then(canvas => {
      canvas.toBlob(async (blob) => {
        const file = new File([blob], "R69_Fortune.png", { type: "image/png" });
        if (navigator.share) {
          try { await navigator.share({ title: 'R69 求籤', text: `這是 ${currentUser?.username} 的運勢...`, files: [file] }); } 
          catch (err) {}
        } else {
          const link = document.createElement('a');
          link.download = `R69_Result_${Date.now()}.png`;
          link.href = canvas.toDataURL("image/png");
          link.click();
        }
        btn.innerHTML = originalText;
        btn.disabled = false;
      }, 'image/png');
    }).catch(() => {
        alert("截圖失敗");
        btn.innerHTML = originalText;
        btn.disabled = false;
    });
  };

  const logout = () => {
    if (currentUser?.loginType === 'line' && liff.isLoggedIn()) liff.logout();
    if (currentUser?.loginType === 'discord') localStorage.removeItem('r69_access_token');
    window.location.reload();
  };

  const formatTime = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 3600).toString().padStart(2, '0')}:${Math.floor((s % 3600) / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  };

  const getDisplayName = () => {
      if(!currentUser) return '';
      if(currentUser.loginType === 'line' && currentUser.phone && currentUser.phone.length >= 5) {
          return `${currentUser.phone.substring(0,4)}＊＊＊＊＊${currentUser.phone.substring(currentUser.phone.length-1)}`;
      }
      return currentUser.username;
  };

  // 渲染 CTA 區塊
  const renderCustomAction = () => {
    if (!currentUser) return null;
    
    // 樣式物件
    const boxStyle = { padding:'15px', borderRadius:'16px', marginTop:'10px', textAlign:'center' };
    const titleStyle = { margin:'0 0 8px 0', fontSize:'0.9rem', color:'#6b7280' };
    const contentStyle = { fontWeight:'bold', marginBottom:'10px' };
    const linkStyle = { fontWeight:'bold', textDecoration:'underline', background:'none', border:'none', cursor:'pointer', fontSize:'1rem' };

    if (currentUser.loginType === 'discord') {
      return (
        <div style={{...boxStyle, background:'#eff6ff'}}>
          <p style={titleStyle}>Discord 會員專屬</p>
          <div style={contentStyle}>別忘了去領取您的每日身分組！</div>
          <a href={`https://discord.com/channels/${CONFIG.DISCORD_GUILD_ID}`} target="_blank" rel="noreferrer" style={{...linkStyle, color:'#2563eb'}}>前往 Discord 頻道 →</a>
        </div>
      );
    } else if (currentUser.loginType === 'line') {
      return (
        <div style={{...boxStyle, background:'#f0fdf4'}}>
          <p style={titleStyle}>Ocard 會員專屬</p>
          <div style={contentStyle}>已記錄您的資料，請出示畫面核銷。</div>
          {/* 修正 3: 使用 button 代替無效 href */}
          <button className="action-link" style={{...linkStyle, color:'#16a34a'}}>查看優惠券 →</button>
        </div>
      );
    } else {
      return (
        <div style={{...boxStyle, background:'#fef2f2'}}>
          <p style={titleStyle}>喜歡這個結果嗎？</p>
          <div style={contentStyle}>加入 R69 高速公路，解鎖更多功能！</div>
          <a href="https://discord.gg/Hw7aVwDXwj" target="_blank" rel="noreferrer" style={{...linkStyle, color:'#dc2626'}}>立即加入 Discord →</a>
        </div>
      );
    }
  };

  // === 主渲染 ===
  return (
    <div className="App">
      {/* 彈窗 (Modals) */}
      <div className={`modal-backdrop ${activeModal ? 'show' : ''}`} onClick={(e) => { if(e.target.classList.contains('modal-backdrop')) setActiveModal(null); }}>
        <div className="modal-content">
           <div className="modal-icon-circle">
              {activeModal?.includes('guide') ? <i className="fa-solid fa-book"></i> : <i className="fa-solid fa-gift"></i>}
           </div>
           <h2>{activeModal?.includes('guide') ? '使用指南' : '活動獎品'}</h2>
           
           <div className="modal-text-left">
             {/* 根據不同 Modal 顯示不同內容 */}
             {activeModal === 'guide-discord' && (
                <>
                  <p>1. <b>身分驗證</b>：授權 Discord 帳號以確認身分。</p>
                  <p>2. <b>每日一籤</b>：每 3 小時可求籤一次。</p>
                  <p>3. <b>自動領取</b>：求籤後機器人會自動發放身分組。</p>
                </>
             )}
             {activeModal === 'prizes-discord' && (
                <p>【專屬身分組】 x 1<br/>累積籤王次數可解鎖隱藏頻道</p>
             )}
             
             {activeModal === 'guide-line' && (
                <>
                   <p>1. <b>綁定手機</b>：請輸入 Ocard 註冊手機。</p>
                   <p>2. <b>結果同步</b>：求籤結果將記錄於會員系統。</p>
                </>
             )}
             {activeModal === 'prizes-line' && (
                <p>【門市優惠券】 x 1<br/>消費滿額贈禮</p>
             )}

             {activeModal === 'guide-guest' && (
                <>
                  <p>1. <b>快速體驗</b>：輸入暱稱即可馬上求籤。</p>
                  <p>2. <b>功能限制</b>：訪客無法累積紀錄或領獎。</p>
                </>
             )}
             {activeModal === 'prizes-guest' && (
                <p>目前僅提供運勢占卜體驗<br/>加入 Discord 或 Ocard 解鎖獎品！</p>
             )}
           </div>
           <button className="main-btn dark-btn" onClick={() => setActiveModal(null)}>我知道了</button>
        </div>
      </div>

      <div className="container">
        {/* Logo */}
        <div className="logo-container">
          <a href="https://discord.gg/Hw7aVwDXwj" style={{display:'inline-block'}}>
            <img src={IMG_LOGO} alt="Logo" className="logo-img" />
          </a>
          <h1>神廟求雞緣系統</h1>
          <p className="subtitle">請選擇你的身份</p>
        </div>

        {/* View: Login */}
        {view === 'login' && (
          <div id="login-section" className="login-cards-container">
            {/* Discord */}
            <div className="card-base">
              <div className="card-header">
                <div className="header-left"><i className="fa-brands fa-discord" style={{color:'var(--discord-color)'}}></i> R69高速公路成員</div>
                <div className="header-right">
                  <button className="icon-btn" onClick={() => setActiveModal('guide-discord')}><i className="fa-solid fa-list"></i></button>
                  <button className="icon-btn" onClick={() => setActiveModal('prizes-discord')}><i className="fa-solid fa-gift"></i></button>
                </div>
              </div>
              <p className="card-desc">使用 Discord 身份驗證登入</p>
              <button onClick={handleDiscordLogin} className="main-btn discord-btn">前往驗證</button>
            </div>

            {/* LINE */}
            <div className="card-base">
              <div className="card-header">
                <div className="header-left"><i className="fa-solid fa-store" style={{color:'var(--line-color)'}}></i> 門市 Ocard 會員</div>
                <div className="header-right">
                  <button className="icon-btn" onClick={() => setActiveModal('guide-line')}><i className="fa-solid fa-list"></i></button>
                  <button className="icon-btn" onClick={() => setActiveModal('prizes-line')}><i className="fa-solid fa-gift"></i></button>
                </div>
              </div>
              <p className="card-desc">使用 LINE 登入並綁定手機</p>
              <input 
                type="tel" 
                className="input-field" 
                placeholder="請輸入手機號碼 (09xxxxxxxx)" 
                maxLength={10}
                inputMode="numeric"
                value={linePhone}
                onChange={(e) => setLinePhone(e.target.value.replace(/[^0-9]/g, ''))}
              />
              <button onClick={handleLineLoginBtn} className="main-btn green-btn">LINE 登入</button>
            </div>

            {/* Guest */}
            <div className="card-base guest-mode">
              <div className="card-header">
                <div className="header-left"><i className="fa-solid fa-user"></i> 訪客模式</div>
                <div className="header-right">
                  <button className="icon-btn" onClick={() => setActiveModal('guide-guest')}><i className="fa-solid fa-list"></i></button>
                  <button className="icon-btn" onClick={() => setActiveModal('prizes-guest')}><i className="fa-solid fa-gift"></i></button>
                </div>
              </div>
              <p className="card-desc">功能受限，僅供快速體驗</p>
              <input 
                type="text" 
                className="input-field" 
                placeholder="請輸入您的暱稱" 
                maxLength={10}
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
              />
              <button onClick={handleGuestLogin} className="main-btn">訪客進入</button>
            </div>
          </div>
        )}

        {/* View: Machine (Start) */}
        {view === 'machine' && (
          <div className="white-card-container">
            <div style={{width:'100%'}}>
              <div className="tenga-container" style={{margin:'0 auto 20px auto'}}>
                <img id="stick-icon" src={IMG_TENGA} alt="Tenga" className="tenga-img" />
              </div>
              <p className="machine-text">誠心祈求，宇宙將給你30公分或更多</p>
              <button id="draw-btn" className="main-btn dark-btn" style={{borderRadius:'50px', padding:'15px 30px', width:'100%'}} onClick={drawFortune}>
                <i className="fa-solid fa-wand-magic-sparkles"></i> 開始求籤
              </button>
            </div>
          </div>
        )}

        {/* View: Result or Cooldown */}
        {(view === 'result' || view === 'cooldown') && fortune && (
          <div className="white-card-container">
            <div style={{width: '100%'}}>
              
              {/* 如果是冷卻中，顯示倒數 (使用修正 1 的 historyResult) */}
              {view === 'cooldown' && (
                <div className="cooldown-view">
                    <div className="cooldown-title">賢者模式冷卻中</div>
                    <div id="countdown" className="countdown-digits">{formatTime(cooldownTime)}</div>
                    <div className="cooldown-label">距離下次求籤</div>
                    
                    {/* 顯示上次結果文字 */}
                    <div className="history-box">
                        <div className="history-label">上次結果</div>
                        <div className="history-content">{historyResult}</div>
                    </div>
                </div>
              )}

              {/* 截圖區域 (包含結果) */}
              <div id="capture-target" ref={captureRef} style={{marginTop: view === 'cooldown' ? '20px' : '0'}}>
                  <div className="res-logo-header">
                      <img src={IMG_LOGO} style={{height:'30px', width:'auto'}} alt="logo"/>
                      <span style={{fontWeight:'800', color:'var(--text-dark)', fontSize:'1.1rem'}}>神廟求雞緣</span>
                  </div>

                  <div className="res-user-box">
                      <img src={currentUser?.avatar || `https://cdn.discordapp.com/embed/avatars/0.png`} className="res-user-avatar" alt="avatar" />
                      <span className="res-user-name">{getDisplayName()}</span>
                  </div>

                  <div className="res-number">【第 {fortune.id} 首】</div>
                  <div className="res-type" style={{color: fortune.type.includes('籤王') ? '#d97706' : '#1f2937'}}>{fortune.type}</div>
                  <div className="res-title">{fortune.title}</div>
                  
                  <div className="info-box">
                      <div className="info-label"><i className="fa-solid fa-book-open" style={{color:'#60a5fa'}}></i> 知識</div>
                      <div className="info-text">{fortune.knowledge}</div>
                  </div>
                  
                  <div className="info-box yellow">
                      <div className="info-label"><i className="fa-solid fa-lightbulb" style={{color:'#f59e0b'}}></i> 小提醒</div>
                      <div className="info-text">{fortune.reminder}</div>
                  </div>

                  <div style={{marginTop:'20px', textAlign:'center', fontSize:'0.8rem', color:'#9ca3af'}}>
                      R69 高速公路 by r-Xing 阿性情趣
                  </div>
              </div>

              <div style={{marginTop: '20px'}}>
                  <button id="dl-btn" className="main-btn dark-btn" style={{borderRadius:'50px', width:'100%'}} onClick={downloadImage}>
                      <i className="fa-solid fa-camera"></i> 保存結果圖片
                  </button>
              </div>
              <div style={{marginTop: '20px'}}>
                {renderCustomAction()}
              </div>
            </div>
          </div>
        )}

        {/* User Footer */}
        {currentUser && (
          <div id="user-display">
             <div className="user-capsule">
                <img src={currentUser.avatar || `https://cdn.discordapp.com/embed/avatars/0.png`} alt="avatar" />
                <span>{currentUser.username}</span>
                <div style={{width:'1px', height:'12px', background:'#d1d5db'}}></div>
                <button onClick={logout} style={{border:'none', background:'none', color:'#ef4444', fontWeight:'bold', cursor:'pointer'}}>
                   登出 <i className="fa-solid fa-arrow-right-from-bracket"></i>
                </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default App;