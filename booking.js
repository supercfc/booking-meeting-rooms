import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Calendar as CalendarIcon, 
  Users, 
  Settings, 
  Clock, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Trash2,
  CheckCircle2,
  AlertCircle,
  Download,
  Upload,
  FileText,
  Save,
  Printer,
  XCircle,
  Cloud,
  Lock,
  Link2,
  FileDown,
  Sun,
  Sunrise,
  Sunset,
  Layout,
  CheckCircle,
  UserPlus
} from 'lucide-react';

// --- Firebase 相關導入 ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  collection, 
  onSnapshot, 
  deleteDoc, 
  writeBatch,
  query
} from 'firebase/firestore';

// --- 常數與工具函數 ---
const ROOMS = ['談話室一', '談話室二', '談話室三', '談話室四', '談話室五', '談話室六', '諮商室'];
const YEAR = 2026;
const DELETE_PASSWORD = "202655688"; 
const TIME_SLOTS = [
  { id: 'morning', label: '上午' },
  { id: 'afternoon', label: '下午' }
];

const HOLIDAYS_2026 = [
  '2026-01-01', // 元旦 (週四)
  '2026-02-16', // 農曆除夕 (週一)
  '2026-02-17', // 農曆春節 (週二)
  '2026-02-18', // 農曆春節 (週三)
  '2026-02-19', // 農曆春節 (週四)
  '2026-02-20', // 調整放假 (週五)
  '2026-02-27', // 二二八和平紀念日補假 (週五)
  '2026-04-03', // 兒童節及民族掃墓節補假 (週五)
  '2026-04-06', // 兒童節及民族掃墓節補假 (週一)
  '2026-05-01', // 勞動節 (週五)
  '2026-06-19', // 端午節 (週五)
  '2026-09-25', // 中秋節 (週五)
  '2026-10-09', // 國慶日補假 (週五)
];

const isHoliday = (dateStr) => {
  const d = new Date(dateStr);
  const day = d.getDay();
  return day === 0 || day === 6 || HOLIDAYS_2026.includes(dateStr);
};

const getDaysInMonth = (month) => new Date(YEAR, month, 0).getDate();
const formatDate = (m, d) => `${YEAR}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const getMemberDisplayName = (id, members) => {
  const member = members.find(m => m.id === id);
  return (member?.name && member.name.trim() !== '') ? member.name : id;
};

// --- Firebase 初始化 ---
const firebaseConfig = JSON.parse(__firebase_config);
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const defaultAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- 子組件：人員輸入框 ---
const MemberInput = ({ member, onUpdate }) => {
  const [localValue, setLocalValue] = useState(member.name || '');
  useEffect(() => { setLocalValue(member.name || ''); }, [member.name]);
  const handleBlur = () => {
    const trimmed = localValue.slice(0, 10);
    if (trimmed !== member.name) {
      setLocalValue(trimmed);
      onUpdate(member.id, trimmed);
    }
  };
  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border-2 border-slate-100 flex flex-col gap-2 transition-all hover:shadow-md hover:border-blue-300">
      <div className="flex items-center gap-3">
        <span className={`px-2 py-1 rounded text-xs font-black ${member.type === 'probation_officer' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
          {member.id}
        </span>
        <div className="flex-1">
          <input className="w-full border-b-2 border-slate-100 focus:border-blue-500 outline-none px-1 py-1 text-lg font-black text-black bg-transparent" placeholder="輸入姓名" value={localValue} onChange={(e) => setLocalValue(e.target.value)} onBlur={handleBlur} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} />
        </div>
      </div>
    </div>
  );
};

// --- 子組件：報表彙整 (A4直印/向上對齊) ---
const ReportSection = ({ currentMonth, setCurrentMonth, members, adhocBookings, fixedSchedules, showNotification }) => {
  const pdfRef = useRef(null);
  const daysInMonth = getDaysInMonth(currentMonth);
  const firstDay = new Date(YEAR, currentMonth - 1, 1).getDay();

  const handleExportPDF = async () => {
    if (!pdfRef.current) return;
    showNotification('正在產製 PDF...', 'info');
    try {
      if (!window.html2canvas || !window.jspdf) {
        await Promise.all([
          new Promise(r => { const s = document.createElement('script'); s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"; s.onload = r; document.head.appendChild(s); }),
          new Promise(r => { const s = document.createElement('script'); s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"; s.onload = r; document.head.appendChild(s); })
        ]);
      }
      const canvas = await window.html2canvas(pdfRef.current, { scale: 3, useCORS: true, backgroundColor: '#ffffff', width: 850 });
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4'); 
      const imgData = canvas.toDataURL('image/png');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const imgWidth = pdfWidth - (margin * 2);
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = margin;
      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
      heightLeft -= (pdfHeight - margin * 2);
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight + margin;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
        heightLeft -= (pdfHeight - margin * 2);
      }
      pdf.save(`${YEAR}年${currentMonth}月_談話室預約報表.pdf`);
      showNotification('PDF 下載成功', 'success');
    } catch (error) { showNotification('匯出失敗', 'error'); }
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8 no-print text-black font-black">
        <h2 className="text-3xl font-black flex items-center gap-3 text-orange-600 font-black"><FileText size={32} /> 報表彙整</h2>
        <div className="flex gap-4">
          <select className="border-2 rounded-xl px-4 font-black text-lg text-black" value={currentMonth} onChange={e => setCurrentMonth(parseInt(e.target.value))}>
            {Array.from({length: 11}, (_, i) => i + 2).map(m => <option key={m} value={m}>{m} 月份</option>)}
          </select>
          <button onClick={handleExportPDF} className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 transition-all active:scale-95 shadow-xl font-black"><FileDown /> 匯出 PDF</button>
        </div>
      </div>
      <div ref={pdfRef} className="bg-white p-12 rounded-xl shadow-2xl border mx-auto text-black" style={{ width: '850px' }}>
        <div className="mb-10 text-center border-b-8 border-slate-900 pb-6">
          <h1 className="text-4xl font-black text-slate-900 tracking-tight font-black">{YEAR} 年 {currentMonth} 月 談話室預約報表</h1>
          <p className="mt-4 text-slate-500 font-bold text-lg font-black">產製日期：{new Date().toLocaleDateString()}</p>
        </div>
        <div className="grid grid-cols-7 border-4 border-slate-900 bg-slate-50 text-black">
          {['日', '一', '二', '三', '四', '五', '六'].map(d => (<div key={d} className="py-4 text-center font-black text-slate-900 border-x-2 border-slate-200 text-xl font-black">週{d}</div>))}
        </div>
        <div className="grid grid-cols-7 border-4 border-t-0 border-slate-900">
          {Array.from({ length: firstDay }).map((_, i) => (<div key={i} className="min-h-[160px] bg-slate-50 border-2 border-slate-100 opacity-50 font-black"></div>))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dayNum = i + 1;
            const dateStr = formatDate(currentMonth, dayNum);
            const holiday = isHoliday(dateStr);
            const dow = new Date(dateStr).getDay();
            return (
              <div key={dayNum} className={`min-h-[160px] p-3 border-2 border-slate-500 flex flex-col justify-start text-center ${holiday ? 'bg-red-50/50' : 'bg-white'}`}>
                <div className="mb-2 text-center text-black font-black font-black"><span className={`text-4xl font-black ${holiday ? 'text-red-500' : 'text-slate-900'}`}>{dayNum}</span></div>
                <div className="space-y-3 flex flex-col items-center justify-start flex-1 pb-4 text-black">
                  {TIME_SLOTS.map(slot => {
                    const slotBookings = ROOMS.map(r => {
                      const bA = adhocBookings.find(x => x.date === dateStr && x.room === r && x.timeSlot === slot.id);
                      const bF = fixedSchedules.find(x => x.weekday === dow && x.room === r && x.timeSlot === slot.id);
                      return bA || bF ? { room: r, isAdhoc: !!bA, userId: (bA || bF).userId } : null;
                    }).filter(x => x !== null);
                    if (slotBookings.length === 0) return null;
                    return (
                      <div key={slot.id} className="w-full flex flex-col items-center mt-1">
                        <div className="text-[10px] font-black text-slate-400 border-b-2 border-slate-200 w-full mb-1 pb-1 font-black">{slot.label}</div>
                        {slotBookings.map((b, idx) => (
                          <div key={idx} className={`w-full min-h-[42px] px-2 py-2 rounded-lg border-2 mb-1 flex flex-col items-center justify-center font-black ${b.isAdhoc ? 'bg-orange-50 text-orange-800 border-orange-100' : 'bg-blue-50 text-blue-900 border-blue-200'}`}>
                            <div className="text-[14px] w-full text-center text-black font-black leading-tight font-black">{getMemberDisplayName(b.userId, members)}</div>
                            <div className="text-[9px] opacity-70 w-full text-center font-bold text-black font-black">{b.room}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// --- 主應用組件 ---
const App = () => {
  const [activeTab, setActiveTab] = useState('calendar');
  const [currentMonth, setCurrentMonth] = useState(2);
  const [selectedDate, setSelectedDate] = useState(null);
  const [notification, setNotification] = useState(null);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null); 
  const [pendingImportData, setPendingImportData] = useState(null);
  
  const [syncKey, setSyncKey] = useState(() => localStorage.getItem('meeting_sync_key') || defaultAppId);
  const [tempSyncKey, setTempSyncKey] = useState(syncKey);
  const [members, setMembers] = useState([]);
  const [fixedSchedules, setFixedSchedules] = useState([]);
  const [adhocBookings, setAdhocBookings] = useState([]);
  const fileInputRef = useRef(null);

  // 預約詳情彈窗狀態
  const [formRoom, setFormRoom] = useState(ROOMS[0]);
  const [formTime, setFormTime] = useState(TIME_SLOTS[0].id);
  const [formUser, setFormUser] = useState("");

  const showNotification = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else { await signInAnonymously(auth); }
      } catch (err) { console.error(err); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    setIsLoading(true);
    const basePath = ['artifacts', syncKey, 'public', 'data'];
    const unsubMembers = onSnapshot(collection(db, ...basePath, 'members'), (snapshot) => {
      const data = snapshot.docs.map(d => d.data());
      if (data.length === 0) {
        // 更新：心理師人數增加至 20 個 (PS01~PS20)
        const po = Array.from({ length: 19 }, (_, i) => ({ id: `PO${String(i + 1).padStart(2, '0')}`, name: '', type: 'probation_officer' }));
        const ps = Array.from({ length: 20 }, (_, i) => ({ id: `PS${String(i + 1).padStart(2, '0')}`, name: '', type: 'psychologist' }));
        const initial = [...po, ...ps];
        const batch = writeBatch(db);
        initial.forEach(m => batch.set(doc(db, ...basePath, 'members', m.id), m));
        batch.commit();
        setMembers(initial);
      } else { setMembers(data); }
      setIsLoading(false);
    });
    const unsubFixed = onSnapshot(collection(db, ...basePath, 'fixedSchedules'), (s) => setFixedSchedules(s.docs.map(d => ({ ...d.data(), fsId: d.id }))));
    const unsubAdhoc = onSnapshot(collection(db, ...basePath, 'adhocBookings'), (s) => setAdhocBookings(s.docs.map(d => ({ ...d.data(), ahId: d.id }))));
    return () => { unsubMembers(); unsubFixed(); unsubAdhoc(); };
  }, [user, syncKey]);

  const updateMemberName = async (id, newName) => {
    if (!user) return;
    await setDoc(doc(db, 'artifacts', syncKey, 'public', 'data', 'members', id), { name: newName }, { merge: true });
  };

  const handleAddFixed = async (userId, weekday, room, timeSlot) => {
    if (!user || !userId) return;
    const fsId = `${weekday}_${room}_${timeSlot}`;
    await setDoc(doc(db, 'artifacts', syncKey, 'public', 'data', 'fixedSchedules', fsId), { userId, weekday, room, timeSlot });
    showNotification('固定排班已更新', 'success');
  };

  const handleAddAdhoc = async (date, room, userId, timeSlot) => {
    if (!user || !userId) return;
    const ahId = `${date}_${room}_${timeSlot}`;
    await setDoc(doc(db, 'artifacts', syncKey, 'public', 'data', 'adhocBookings', ahId), { date, room, userId, timeSlot });
    showNotification('預約成功', 'success');
  };

  const executeAuthAction = async () => {
    if (!user || !deleteTarget) return;
    try {
      const basePath = ['artifacts', syncKey, 'public', 'data'];
      if (deleteTarget.type === 'fixed') { await deleteDoc(doc(db, ...basePath, 'fixedSchedules', deleteTarget.id)); showNotification('已移除排班', 'info'); }
      else if (deleteTarget.type === 'adhoc') { await deleteDoc(doc(db, ...basePath, 'adhocBookings', deleteTarget.id)); showNotification('已取消預約', 'info'); }
      else if (deleteTarget.type === 'import') {
        const batch = writeBatch(db);
        const data = pendingImportData;
        if (data.members) data.members.forEach(m => batch.set(doc(db, ...basePath, 'members', m.id), m));
        if (data.fixedSchedules) data.fixedSchedules.forEach(f => batch.set(doc(db, ...basePath, 'fixedSchedules', `${f.weekday}_${f.room}_${f.timeSlot}`), f));
        if (data.adhocBookings) data.adhocBookings.forEach(a => batch.set(doc(db, ...basePath, 'adhocBookings', `${a.date}_${a.room}_${a.timeSlot}`), a));
        await batch.commit();
        showNotification('雲端還原完成', 'success');
      }
      setDeleteTarget(null);
    } catch (err) { showNotification('執行失敗', 'error'); }
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="animate-spin rounded-full h-20 w-20 border-t-8 border-blue-600"></div></div>;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-800">
      {notification && <div className={`fixed top-24 left-1/2 -translate-x-1/2 z-[2000] px-10 py-5 rounded-[2rem] shadow-2xl flex items-center gap-4 text-white font-black animate-in slide-in-from-top duration-300 ${notification.type === 'error' ? 'bg-red-600' : notification.type === 'success' ? 'bg-green-600' : 'bg-slate-900'}`}>{notification.msg}</div>}

      <header className="sticky top-0 z-[500] bg-slate-900 text-white shadow-2xl no-print">
        <div className="max-w-[1600px] mx-auto px-10 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Sunrise className="text-orange-400" size={32} />
            <div className="flex flex-col"><h1 className="text-xl font-black tracking-tighter text-white font-black">談話室預約管理系統</h1><p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.3em] font-black">Probation Office System</p></div>
          </div>
          <nav className="flex items-center gap-2">
            {[{id:'calendar',icon:<CalendarIcon size={18}/>,label:'預約現況'},{id:'fixed',icon:<Settings size={18}/>,label:'固定排班'},{id:'members',icon:<Users size={18}/>,label:'人員管理'},{id:'reports',icon:<FileText size={18}/>,label:'報表彙整'},{id:'data',icon:<Save size={18}/>,label:'系統維護'}].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all font-black text-sm ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>{tab.icon} {tab.label}</button>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        <div className="max-w-full mx-auto p-8">
          {activeTab === 'calendar' && (
            <div>
              <div className="flex justify-between items-center mb-8 bg-white p-8 rounded-[2.5rem] shadow-sm border-2 border-slate-100">
                <div><h2 className="text-3xl font-black text-slate-900 flex items-center gap-3 font-black"><CalendarIcon className="text-blue-600" size={36} /> {YEAR}年{currentMonth}月 預約狀態列表</h2><div className="text-sm text-black font-black mt-2 font-mono flex items-center gap-2 font-black"><Link2 size={14}/> 連線金鑰: {syncKey}</div></div>
                <div className="flex gap-4">
                  <button onClick={() => setCurrentMonth(m => Math.max(2, m-1))} disabled={currentMonth===2} className="p-3 border-2 rounded-2xl hover:bg-slate-50 disabled:opacity-20 transition-all shadow-sm"><ChevronLeft size={28}/></button>
                  <button onClick={() => setCurrentMonth(m => Math.min(12, m+1))} disabled={currentMonth===12} className="p-3 border-2 rounded-2xl hover:bg-slate-50 disabled:opacity-20 transition-all shadow-sm"><ChevronRight size={28}/></button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-5">
                {['SUN','MON','TUE','WED','THU','FRI','SAT'].map(d => <div key={d} className="font-black text-slate-400 text-center tracking-[0.2em] text-sm mb-4 uppercase font-black">{d}</div>)}
                {Array.from({length: new Date(YEAR, currentMonth - 1, 1).getDay()}).map((_, i) => <div key={i} className="h-44 bg-slate-200/20 rounded-[2.5rem] border-4 border-dashed border-slate-300"></div>)}
                {Array.from({length: getDaysInMonth(currentMonth)}).map((_, i) => {
                  const dateStr = formatDate(currentMonth, i + 1);
                  const holiday = isHoliday(dateStr);
                  const dow = new Date(dateStr).getDay();
                  return (
                    <div key={i} onClick={() => !holiday && setSelectedDate(dateStr)} className={`min-h-[280px] h-auto p-5 border-4 rounded-[3rem] shadow-md transition-all overflow-hidden ${holiday ? 'bg-red-50 border-red-100' : 'bg-white border-white hover:border-blue-500 cursor-pointer hover:shadow-2xl'}`}>
                      <span className={`font-black text-5xl ${holiday ? 'text-red-400' : 'text-slate-900'} font-black`}>{i+1}</span>
                      <div className="mt-8 space-y-6">
                        {TIME_SLOTS.map(slot => {
                          const slotItems = ROOMS.map(r => {
                            const bA = adhocBookings.find(x => x.date === dateStr && x.room === r && x.timeSlot === slot.id);
                            const bF = fixedSchedules.find(x => x.weekday === dow && x.room === r && x.timeSlot === slot.id);
                            return bA || bF ? { room: r, isAdhoc: !!bA, userId: (bA || bF).userId } : null;
                          }).filter(x => x !== null);
                          if (slotItems.length === 0) return null;
                          return (
                            <div key={slot.id} className="relative">
                              <div className="text-sm font-black text-black uppercase tracking-widest flex items-center gap-2 mb-3 border-b-2 border-slate-100 pb-1 font-black">{slot.id === 'morning' ? <Sunrise className="text-orange-500" size={16}/> : <Sunset className="text-blue-500" size={16}/>} {slot.label}</div>
                              <div className="space-y-2">
                                {slotItems.map((item, idx) => (
                                  <div key={idx} className={`px-4 py-3 rounded-2xl flex justify-between items-center leading-none font-black border-2 shadow-sm ${item.isAdhoc ? 'bg-orange-50 text-orange-900 border-orange-100' : 'bg-blue-50 text-blue-900 border-blue-200'}`}>
                                    <span className="opacity-40 text-[10px] mr-2 text-black font-bold font-black">{item.room}</span>
                                    <span className="text-[22px] flex-1 text-right text-black font-black leading-none font-black">{getMemberDisplayName(item.userId, members)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'fixed' && (
            <div className="space-y-10">
              <h2 className="text-3xl font-black flex items-center gap-3 text-green-700 text-black font-black font-black"><Settings size={32}/> 固定排班管理</h2>
              <div className="bg-white p-10 rounded-[3rem] shadow-xl border-4 border-green-50 flex flex-wrap gap-8 items-end mb-8 text-black">
                <div className="flex-1 min-w-[250px]"><label className="text-xs font-black text-slate-400 mb-3 block font-black">選擇觀護人</label><select className="w-full border-4 border-slate-100 rounded-[1.5rem] p-4 font-black text-lg bg-slate-50 text-black font-black font-black" id="fx-u"><option value="">選擇人員...</option>{members.filter(m=>m.type==='probation_officer').map(m=><option key={m.id} value={m.id}>{getMemberDisplayName(m.id, members)}</option>)}</select></div>
                <div className="w-48"><label className="text-xs font-black text-slate-400 mb-3 block font-black">固定星期</label><select className="w-full border-4 border-slate-100 rounded-[1.5rem] p-4 font-black text-lg bg-slate-50 text-black font-black font-black" id="fx-d">{[1,2,3,4,5].map(d=><option key={d} value={d}>星期{['日','一','二','三','四','五','六'][d]}</option>)}</select></div>
                <div className="w-48"><label className="text-xs font-black text-slate-400 mb-3 block font-black">時段</label><select className="w-full border-4 border-slate-100 rounded-[1.5rem] p-4 font-black text-lg bg-slate-50 text-black font-black font-black" id="fx-t">{TIME_SLOTS.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
                <div className="w-52"><label className="text-xs font-black text-slate-400 mb-3 block font-black">會議室</label><select className="w-full border-4 border-slate-100 rounded-[1.5rem] p-4 font-black text-lg bg-slate-50 text-black font-black font-black" id="fx-r">{ROOMS.map(r=><option key={r} value={r}>{r}</option>)}</select></div>
                <button onClick={() => { const u = document.getElementById('fx-u').value; const t = document.getElementById('fx-t').value; if(u) handleAddFixed(u, parseInt(document.getElementById('fx-d').value), document.getElementById('fx-r').value, t); }} className="bg-green-600 text-white px-10 py-5 rounded-2xl font-black shadow-xl hover:bg-green-700 active:scale-95 transition-all text-lg font-black font-black font-black">同步排班</button>
              </div>
              <div className="bg-white rounded-[3rem] shadow-xl border overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b-4 border-slate-100 text-black font-black"><tr><th className="p-8 font-black text-xl text-slate-500 font-black font-black">日期與時段</th><th className="p-8 font-black text-xl text-slate-500 font-black font-black">空間</th><th className="p-8 font-black text-xl text-slate-500 font-black font-black">使用者</th><th className="p-8 font-black text-xl text-slate-500 font-black font-black">管理</th></tr></thead>
                  <tbody className="divide-y-2 divide-slate-50 text-black font-black font-black">{fixedSchedules.sort((a,b)=>a.weekday-b.weekday).map(f=>(<tr key={f.fsId} className="hover:bg-slate-50/50 transition-colors text-black font-black"><td className="p-8 font-black text-xl text-slate-700 font-black font-black">每週 {['日','一','二','三','四','五','六'][f.weekday]} ({TIME_SLOTS.find(s=>s.id===f.timeSlot)?.label})</td><td className="p-8 font-bold text-slate-600 text-xl font-black font-black">{f.room}</td><td className="p-8 font-black text-blue-700 text-2xl font-black font-black">{getMemberDisplayName(f.userId, members)}</td><td className="p-8 font-black"><button onClick={()=>setDeleteTarget({type:'fixed',id:f.fsId,label:`星期${['日','一','二','三','四','五','六'][f.weekday]} ${f.room}`})} className="text-red-400 hover:text-red-600 p-3 rounded-2xl transition-all shadow-sm"><Trash2 size={24}/></button></td></tr>))}</tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'members' && (
            <div><h2 className="text-3xl font-black flex items-center gap-3 text-purple-700 text-black font-black font-black"><Users size={32}/> 人員編制管理</h2><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 text-black font-black font-black">{members.sort((a,b)=>a.id.localeCompare(b.id)).map(m=><MemberInput key={m.id} member={m} onUpdate={updateMemberName}/>)}</div></div>
          )}

          {activeTab === 'reports' && <ReportSection currentMonth={currentMonth} setCurrentMonth={setCurrentMonth} members={members} adhocBookings={adhocBookings} fixedSchedules={fixedSchedules} showNotification={showNotification} />}

          {activeTab === 'data' && (
            <div className="max-w-[1200px] mx-auto space-y-4">
              <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3 text-black font-black font-black"><Save size={28}/> 系統維護</h2>
              <div className="bg-blue-800 text-white p-6 rounded-[2rem] shadow-xl border-4 border-blue-500/20 text-black font-black">
                <h3 className="text-lg font-black mb-1 flex items-center gap-2 font-black font-black text-white"><Link2 size={20}/> 共享金鑰連線</h3>
                <p className="text-blue-100 text-xs font-bold mb-4 font-black font-black">輸入金鑰即可在多台主機間同步數據。</p>
                <div className="flex gap-4">
                  <input className="flex-1 bg-white/10 border-2 border-white/20 rounded-2xl px-5 py-3 text-xl font-mono text-white outline-none focus:bg-white/20 focus:border-white/40 transition-all placeholder:text-white/20" value={tempSyncKey} onChange={e=>setTempSyncKey(e.target.value)} placeholder="自定義金鑰" />
                  <button onClick={()=>{localStorage.setItem('meeting_sync_key',tempSyncKey);setSyncKey(tempSyncKey);showNotification('金鑰更新完成','success');}} className="bg-white text-blue-800 px-8 py-3 rounded-2xl font-black text-lg font-black font-black">切換</button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-black font-black">
                <button onClick={()=>{ const data={members,fixedSchedules,adhocBookings,syncKey,exportAt:new Date().toISOString()}; const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a');a.href=url;a.download=`backup_${syncKey}.json`;a.click(); showNotification('備份下載完成','success'); }} className="bg-white p-6 rounded-[2rem] flex items-center gap-6 font-black text-slate-700 border-2 border-transparent hover:border-blue-200 transition-all shadow-lg group font-black"><Download className="text-blue-600" size={40} /><div className="text-lg font-black">下載資料備份</div></button>
                <button onClick={()=>fileInputRef.current.click()} className="bg-white p-6 rounded-[2rem] flex items-center gap-6 font-black text-slate-700 border-2 border-transparent hover:border-orange-200 transition-all shadow-lg group font-black"><Upload className="text-orange-600" size={40} /><div className="text-lg font-black font-black">還原雲端資料</div></button>
                <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={e=>{ const reader=new FileReader(); reader.onload=ev=>{ setPendingImportData(JSON.parse(ev.target.result)); setDeleteTarget({type:'import',label:`覆蓋雲端資料庫`}); }; reader.readAsText(e.target.files[0]); e.target.value=''; }} />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 預約詳情 Modal - 核心優化：三欄式連動佈局 (100% 不捲動) */}
      {selectedDate && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-2xl flex items-center justify-center p-2 z-[3000] animate-in fade-in duration-200 font-black">
          <div className="bg-white rounded-[2rem] w-full max-w-7xl shadow-2xl overflow-hidden border-[8px] border-white flex flex-col h-[95vh] text-black font-black">
            {/* 標題列：極致壓縮 */}
            <div className="bg-blue-700 px-8 py-3 text-white flex justify-between items-center shrink-0 shadow-lg font-black">
              <h3 className="text-3xl font-black tracking-tighter text-white">{selectedDate.replace(/-/g, ' / ')} 預約狀態</h3>
              <button onClick={()=>setSelectedDate(null)} className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition-all active:scale-90 text-white font-black leading-none">✕</button>
            </div>
            
            <div className="flex-1 grid grid-cols-3 divide-x-2 divide-slate-100 overflow-hidden bg-white font-black">
              {/* 第一欄：上午預約 */}
              <div className="flex flex-col p-3 overflow-hidden font-black">
                <h4 className="font-black text-slate-800 text-lg tracking-widest flex items-center gap-2 border-b-2 border-orange-200 pb-1 mb-2 shrink-0 font-black">
                  <Sunrise className="text-orange-500" size={20}/> 上午
                </h4>
                <div className="flex-1 overflow-y-auto custom-scroll space-y-1 pr-1 font-black">
                  {ROOMS.map(rm => {
                    const bA = adhocBookings.find(x => x.date === selectedDate && x.room === rm && x.timeSlot === 'morning');
                    const bF = fixedSchedules.find(x => x.weekday === new Date(selectedDate).getDay() && x.room === rm && x.timeSlot === 'morning');
                    const b = bA || bF;
                    return (
                      <div key={rm} onClick={() => { setFormRoom(rm); setFormTime('morning'); }} className="flex justify-between items-center px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100 hover:border-orange-400 hover:bg-white cursor-pointer transition-all shadow-sm group font-black">
                        <span className="font-black text-base text-slate-500 group-hover:text-orange-600 font-black">{rm}</span>
                        {b ? (
                          <div className="flex items-center gap-2 font-black">
                            <span className="text-lg px-3 py-0.5 rounded-lg font-black bg-blue-50 text-blue-900 border border-blue-200 font-black">{getMemberDisplayName(b.userId, members)}</span>
                            {bA && <button onClick={(e)=>{e.stopPropagation(); setDeleteTarget({type:'adhoc',id:b.ahId,label:`${selectedDate} 上午 ${rm}`});}} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button>}
                          </div>
                        ) : <span className="text-[10px] text-green-600 font-black px-2 py-0.5 bg-green-50 rounded-full border border-green-100 font-black">開放</span>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 第二欄：下午預約 */}
              <div className="flex flex-col p-3 overflow-hidden font-black">
                <h4 className="font-black text-slate-800 text-lg tracking-widest flex items-center gap-2 border-b-2 border-blue-200 pb-1 mb-2 shrink-0 font-black">
                  <Sunset className="text-blue-500" size={20}/> 下午
                </h4>
                <div className="flex-1 overflow-y-auto custom-scroll space-y-1 pr-1 font-black">
                  {ROOMS.map(rm => {
                    const bA = adhocBookings.find(x => x.date === selectedDate && x.room === rm && x.timeSlot === 'afternoon');
                    const bF = fixedSchedules.find(x => x.weekday === new Date(selectedDate).getDay() && x.room === rm && x.timeSlot === 'afternoon');
                    const b = bA || bF;
                    return (
                      <div key={rm} onClick={() => { setFormRoom(rm); setFormTime('afternoon'); }} className="flex justify-between items-center px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100 hover:border-blue-400 hover:bg-white cursor-pointer transition-all shadow-sm group font-black">
                        <span className="font-black text-base text-slate-500 group-hover:text-blue-600 font-black">{rm}</span>
                        {b ? (
                          <div className="flex items-center gap-2 font-black">
                            <span className="text-xl px-3 py-0.5 rounded-lg font-black bg-blue-50 text-blue-900 border border-blue-200 font-black">{getMemberDisplayName(b.userId, members)}</span>
                            {bA && <button onClick={(e)=>{e.stopPropagation(); setDeleteTarget({type:'adhoc',id:b.ahId,label:`${selectedDate} 下午 ${rm}`});}} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button>}
                          </div>
                        ) : <span className="text-[10px] text-green-600 font-black px-2 py-0.5 bg-green-50 rounded-full border border-green-100 font-black">開放</span>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 第三欄：預約登記表單 - 高效佈局 */}
              <div className="flex flex-col p-4 bg-slate-50 justify-center font-black">
                <div className="p-5 border-2 border-dashed rounded-3xl bg-white border-blue-200 shadow-md font-black">
                  <div className="flex items-center gap-3 mb-4 font-black">
                    <UserPlus className="text-blue-600 font-black" size={24}/>
                    <h4 className="text-xl font-black text-blue-900 font-black font-black">預約登記登記</h4>
                  </div>
                  
                  <div className="space-y-4 font-black">
                    <div className="space-y-1 font-black">
                      <label className="text-[9px] font-black text-slate-400 uppercase ml-2 font-black">談話室</label>
                      <select value={formRoom} onChange={(e)=>setFormRoom(e.target.value)} className="w-full border-2 border-slate-100 rounded-xl p-2.5 font-black text-lg bg-slate-50 focus:border-blue-500 outline-none text-black font-black font-black">
                        {ROOMS.map(x=><option key={x} value={x}>{x}</option>)}
                      </select>
                    </div>

                    <div className="space-y-1 font-black">
                      <label className="text-[9px] font-black text-slate-400 uppercase ml-2 font-black">時段</label>
                      <select value={formTime} onChange={(e)=>setFormTime(e.target.value)} className="w-full border-2 border-slate-100 rounded-xl p-2.5 font-black text-lg bg-slate-50 focus:border-blue-500 outline-none text-black font-black font-black">
                        {TIME_SLOTS.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    </div>

                    <div className="space-y-1 font-black">
                      <label className="text-[9px] font-black text-slate-400 uppercase ml-2 font-black">人員</label>
                      <select value={formUser} onChange={(e)=>setFormUser(e.target.value)} className="w-full border-2 border-slate-100 rounded-xl p-2.5 font-black text-lg bg-slate-50 focus:border-blue-500 outline-none text-black font-black font-black">
                        <option value="">選取預約人員...</option>
                        {members.sort((a,b)=>a.id.localeCompare(b.id)).map(m=><option key={m.id} value={m.id}>{getMemberDisplayName(m.id, members)}</option>)}
                      </select>
                    </div>

                    <button 
                      disabled={!formUser || adhocBookings.some(x=>x.date===selectedDate && x.room===formRoom && x.timeSlot===formTime)}
                      onClick={()=>{ handleAddAdhoc(selectedDate, formRoom, formUser, formTime); setSelectedDate(null); setFormUser(""); }} 
                      className="w-full bg-blue-700 text-white py-4 rounded-2xl font-black text-xl shadow-lg hover:bg-blue-800 active:scale-95 transition-all mt-4 disabled:bg-slate-300 disabled:shadow-none font-black font-black"
                    >
                      {adhocBookings.some(x=>x.date===selectedDate && x.room===formRoom && x.timeSlot===formTime) ? '時段佔用中' : '確認預約'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 驗證 Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-3xl flex items-center justify-center p-8 z-[5000] animate-in zoom-in duration-300 font-black">
          <div className="bg-white rounded-[3rem] w-full max-w-md shadow-2xl p-10 border-[12px] border-white font-black text-black">
            <div className={`w-24 h-24 ${deleteTarget.type==='import'?'bg-orange-100 text-orange-600':'bg-red-100 text-red-600'} rounded-full flex items-center justify-center mb-8 mx-auto shadow-inner font-black`}><Lock size={48}/></div>
            <h3 className="text-3xl font-black text-slate-800 text-center mb-4 font-black">安全管理驗證</h3>
            <p className="text-slate-500 text-lg text-center mb-10 leading-relaxed font-black text-black font-black">執行項目：<br/><span className="font-black text-slate-900 text-xl border-b-4 border-slate-100 pb-1 font-black">{deleteTarget.label}</span></p>
            <input type="password" id="p-chk" className="w-full border-b-[8px] border-slate-100 p-4 text-center text-5xl tracking-[0.5em] outline-none focus:border-blue-500 transition-all bg-transparent mb-4 font-mono text-slate-900 font-black" placeholder="••••" autoFocus onKeyDown={e=>e.key==='Enter' && (document.getElementById('p-chk').value===DELETE_PASSWORD ? executeAuthAction() : showNotification('密碼錯誤','error'))} />
            <div className="grid grid-cols-2 gap-6 mt-12 font-black">
              <button onClick={()=>{setDeleteTarget(null);setPendingImportData(null);}} className="py-6 rounded-2xl font-black text-slate-400 hover:bg-slate-50 transition-colors uppercase tracking-widest text-sm font-black">取消</button>
              <button onClick={()=>{ if(document.getElementById('p-chk').value===DELETE_PASSWORD) executeAuthAction(); else showNotification('密碼錯誤','error'); }} className={`py-6 rounded-2xl font-black text-white shadow-2xl ${deleteTarget.type==='import'?'bg-orange-600 shadow-orange-200':'bg-red-600 shadow-red-200'} active:scale-95 transition-all text-sm uppercase tracking-widest font-black font-black`}>執行</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-scroll::-webkit-scrollbar { width: 10px; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 20px; border: 3px solid white; }
        @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(15px); } }
        .animate-shake { animation: shake 0.2s ease-in-out 0s 2; }
        @media print { .no-print { display: none !important; } }
      `}</style>
    </div>
  );
};

export default App;
