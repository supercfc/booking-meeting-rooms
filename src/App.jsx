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
  UserPlus,
  X
} from 'lucide-react';

// --- Firebase ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { 
  getFirestore, doc, setDoc, collection, onSnapshot, deleteDoc, writeBatch, query, getDocs
} from 'firebase/firestore';

// --- 常數 ---
const ROOMS = ['談話室一', '談話室二', '談話室三', '談話室四', '談話室五', '談話室六', '諮商室'];
const YEAR = 2026;
const DELETE_PASSWORD = "202655688"; 
const TIME_SLOTS = [
  { id: 'morning', label: '上午' },
  { id: 'afternoon', label: '下午' }
];
const MORNING_HOURS = ['08:00', '09:00', '10:00', '11:00', '12:00'];
const AFTERNOON_HOURS = ['13:00', '14:00', '15:00', '16:00', '17:00'];
const ALL_HOURS = [...MORNING_HOURS, ...AFTERNOON_HOURS];

// --- 工具函式 ---
const isTimeConflict = (s1, e1, s2, e2) => s1 < e2 && e1 > s2;

const convertTimeSlot = (booking) => {
  if (booking.startTime && booking.endTime) return booking;
  if (booking.timeSlot === 'morning') return { ...booking, startTime: '08:00', endTime: '12:00' };
  if (booking.timeSlot === 'afternoon') return { ...booking, startTime: '13:00', endTime: '17:00' };
  return booking;
};

const getBookingsForRoomDate = (room, date, adhocBookings, fixedSchedules) => {
  const dow = new Date(date).getDay();
  const adhocs = adhocBookings.filter(x => x.date === date && x.room === room).map(convertTimeSlot);
  const fixed = fixedSchedules.filter(x => x.weekday === dow && x.room === room).map(convertTimeSlot);
  return [...adhocs, ...fixed];
};

const hasConflict = (room, date, startTime, endTime, adhocBookings, fixedSchedules, excludeId = null) => {
  const existing = getBookingsForRoomDate(room, date, adhocBookings, fixedSchedules);
  return existing.some(b => {
    if (excludeId && (b.ahId === excludeId || b.fsId === excludeId)) return false;
    return isTimeConflict(startTime, endTime, b.startTime, b.endTime);
  });
};

const mergeConsecutiveSlots = (bookings, members) => {
  if (!bookings || bookings.length === 0) return [];
  const sorted = [...bookings].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const merged = [];
  for (const booking of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.userId === booking.userId && last.endTime === booking.startTime) {
      last.endTime = booking.endTime;
      last.mergedIds = [...(last.mergedIds || [last.ahId || last.fsId]), booking.ahId || booking.fsId];
    } else {
      merged.push({ ...booking, mergedIds: [booking.ahId || booking.fsId] });
    }
  }
  return merged;
};

const formatTimeRange = (startTime, endTime) => `${startTime.split(':')[0]}-${endTime.split(':')[0]}`;

const HOLIDAYS_2026 = [
  '2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-02-19','2026-02-20',
  '2026-02-27','2026-04-03','2026-04-06','2026-05-01','2026-06-19','2026-09-25','2026-10-09',
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

// 週間加寬、週末壓窄的 grid 樣式
const CALENDAR_GRID_COLS = { gridTemplateColumns: '0.4fr 1fr 1fr 1fr 1fr 1fr 0.4fr' };

// --- Firebase ---
const firebaseConfig = JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG);
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const defaultAppId = import.meta.env.VITE_APP_ID || 'default-app-id';

// --- 人員輸入 ---
const MemberInput = ({ member, onUpdate }) => {
  const [localValue, setLocalValue] = useState(member.name || '');
  useEffect(() => { setLocalValue(member.name || ''); }, [member.name]);
  const handleBlur = () => {
    const trimmed = localValue.slice(0, 10);
    if (trimmed !== member.name) { setLocalValue(trimmed); onUpdate(member.id, trimmed); }
  };
  return (
    <div className="bg-white border-2 border-slate-200 hover:border-indigo-400 transition-colors overflow-hidden rounded-md">
      <div className={`h-1.5 w-full ${member.type === 'probation_officer' ? 'bg-indigo-500' : 'bg-violet-500'}`} />
      <div className="px-4 py-3 flex items-center gap-3">
        <span className={`shrink-0 px-3 py-1.5 rounded text-base font-bold ${
          member.type === 'probation_officer' ? 'bg-indigo-100 text-indigo-700' : 'bg-violet-100 text-violet-700'
        }`}>{member.id}</span>
        <input
          className="flex-1 min-w-0 text-xl font-bold text-slate-900 bg-transparent border-0 border-b-2 border-transparent focus:border-indigo-500 outline-none py-1 transition-colors placeholder:text-slate-400"
          placeholder="輸入姓名" value={localValue}
          onChange={(e) => setLocalValue(e.target.value)} onBlur={handleBlur}
          onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
        />
      </div>
    </div>
  );
};

// --- 報表彙整 ---
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
      const pdfW = pdf.internal.pageSize.getWidth(), pdfH = pdf.internal.pageSize.getHeight(), margin = 10;
      const imgW = pdfW - margin * 2, imgH = (canvas.height * imgW) / canvas.width;
      let hLeft = imgH, pos = margin;
      pdf.addImage(imgData, 'PNG', margin, pos, imgW, imgH);
      hLeft -= (pdfH - margin * 2);
      while (hLeft >= 0) { pos = hLeft - imgH + margin; pdf.addPage(); pdf.addImage(imgData, 'PNG', margin, pos, imgW, imgH); hLeft -= (pdfH - margin * 2); }
      pdf.save(`${YEAR}年${currentMonth}月_談話室預約報表.pdf`);
      showNotification('PDF 下載成功', 'success');
    } catch (error) { showNotification('匯出失敗', 'error'); }
  };

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-6 no-print">
        <h2 className="text-2xl font-bold flex items-center gap-3 text-slate-800">
          <FileText size={26} /> 報表彙整
        </h2>
        <div className="flex gap-3 items-center">
          <select className="border-2 border-slate-300 rounded-md px-4 py-2.5 font-bold text-lg text-slate-900 bg-white outline-none" value={currentMonth} onChange={e => setCurrentMonth(parseInt(e.target.value))}>
            {Array.from({length: 11}, (_, i) => i + 2).map(m => <option key={m} value={m}>{m} 月份</option>)}
          </select>
          <button onClick={handleExportPDF} className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-md font-bold flex items-center gap-2 transition-colors text-lg active:scale-95">
            <FileDown size={18} /> 匯出 PDF
          </button>
        </div>
      </div>
      <div ref={pdfRef} className="bg-white p-8 border-2 border-slate-300 mx-auto" style={{ width: '850px' }}>
        <div className="mb-6 text-center border-b-4 border-slate-800 pb-4">
          <h1 className="text-3xl font-bold text-slate-900">{YEAR} 年 {currentMonth} 月 談話室預約報表</h1>
          <p className="mt-2 text-slate-600 font-semibold text-base">產生日期：{new Date().toLocaleDateString()}</p>
        </div>
        {/* 報表：週末窄、週間寬 */}
        <div className="grid border-2 border-slate-800 bg-slate-100" style={CALENDAR_GRID_COLS}>
          {['日', '一', '二', '三', '四', '五', '六'].map(d => (
            <div key={d} className="py-2.5 text-center font-bold text-slate-900 border-x border-slate-200 text-base">週{d}</div>
          ))}
        </div>
        <div className="grid border-2 border-t-0 border-slate-800" style={CALENDAR_GRID_COLS}>
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={i} className="min-h-[120px] bg-slate-50 border border-slate-100" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dayNum = i + 1;
            const dateStr = formatDate(currentMonth, dayNum);
            const holiday = isHoliday(dateStr);
            const getRoomBookings = (room, isMorning) => {
              const all = getBookingsForRoomDate(room, dateStr, adhocBookings, fixedSchedules);
              return mergeConsecutiveSlots(all.filter(b => isMorning ? b.startTime < '13:00' : b.startTime >= '13:00'), members);
            };
            return (
              <div key={dayNum} className={`min-h-[120px] p-1.5 border border-slate-300 flex flex-col ${holiday ? 'bg-slate-100' : 'bg-white'}`}>
                <div className="mb-1 text-center">
                  <span className={`text-xl font-bold ${holiday ? 'text-red-400' : 'text-slate-900'}`}>{dayNum}</span>
                </div>
                {/* Holiday 不顯示任何預約內容 */}
                {!holiday && (
                  <div className="space-y-1.5 flex flex-col items-center flex-1 pb-1">
                    {TIME_SLOTS.map(slot => {
                      const isMorning = slot.id === 'morning';
                      const slotBookings = ROOMS.flatMap(r => {
                        const bookings = getRoomBookings(r, isMorning);
                        return bookings.map(b => ({ room: r, isAdhoc: !!b.ahId, userId: b.userId, timeRange: formatTimeRange(b.startTime, b.endTime) }));
                      });
                      if (slotBookings.length === 0) return null;
                      return (
                        <div key={slot.id} className="w-full flex flex-col items-center">
                          <div className="text-sm font-bold text-slate-700 border-b border-slate-200 w-full mb-0.5 pb-0.5 text-center">{slot.label}</div>
                          {slotBookings.map((b, idx) => (
                            <div key={idx} className={`w-full px-1.5 py-1 border mb-0.5 text-center ${b.isAdhoc ? 'bg-amber-50 text-amber-900 border-amber-300' : 'bg-indigo-50 text-indigo-900 border-indigo-300'}`}>
                              <div className="text-sm font-bold leading-tight">{getMemberDisplayName(b.userId, members)}</div>
                              <div className="text-[11px] text-slate-700 font-semibold">{b.room} ({b.timeRange})</div>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// --- 主應用 ---
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
  const [formRoom, setFormRoom] = useState(ROOMS[0]);
  const [formStartTime, setFormStartTime] = useState('08:00');
  const [formEndTime, setFormEndTime] = useState('12:00');
  const [formUser, setFormUser] = useState("");
  const [passwordInput, setPasswordInput] = useState("");

  useEffect(() => { if (deleteTarget) setPasswordInput(""); }, [deleteTarget]);

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
    const unsub = onAuthStateChanged(auth, setUser);
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    setIsLoading(true);
    const bp = ['artifacts', syncKey, 'public', 'data'];
    const u1 = onSnapshot(collection(db, ...bp, 'members'), (snap) => {
      const data = snap.docs.map(d => d.data());
      if (data.length === 0) {
        const po = Array.from({ length: 19 }, (_, i) => ({ id: `PO${String(i+1).padStart(2,'0')}`, name: '', type: 'probation_officer' }));
        const ps = Array.from({ length: 20 }, (_, i) => ({ id: `PS${String(i+1).padStart(2,'0')}`, name: '', type: 'psychologist' }));
        const init = [...po, ...ps];
        const batch = writeBatch(db);
        init.forEach(m => batch.set(doc(db, ...bp, 'members', m.id), m));
        batch.commit();
        setMembers(init);
      } else { setMembers(data); }
      setIsLoading(false);
    });
    const u2 = onSnapshot(collection(db, ...bp, 'fixedSchedules'), s => setFixedSchedules(s.docs.map(d => ({ ...d.data(), fsId: d.id }))));
    const u3 = onSnapshot(collection(db, ...bp, 'adhocBookings'), s => setAdhocBookings(s.docs.map(d => ({ ...d.data(), ahId: d.id }))));
    return () => { u1(); u2(); u3(); };
  }, [user, syncKey]);

  const updateMemberName = async (id, newName) => {
    if (!user) return;
    await setDoc(doc(db, 'artifacts', syncKey, 'public', 'data', 'members', id), { name: newName }, { merge: true });
  };
  const handleAddFixed = async (userId, weekday, room, timeSlot) => {
    if (!user || !userId) return;
    await setDoc(doc(db, 'artifacts', syncKey, 'public', 'data', 'fixedSchedules', `${weekday}_${room}_${timeSlot}`), { userId, weekday, room, timeSlot });
    showNotification('固定排班已更新', 'success');
  };
  const handleAddAdhoc = async (date, room, userId, startTime, endTime) => {
    if (!user || !userId) return;
    await setDoc(doc(db, 'artifacts', syncKey, 'public', 'data', 'adhocBookings', `${date}_${room}_${startTime}_${endTime}`), { date, room, userId, startTime, endTime });
    showNotification('預約成功', 'success');
  };
  const executeAuthAction = async () => {
    const target = deleteTarget, importData = pendingImportData;
    setDeleteTarget(null); setPendingImportData(null);
    if (!target) return;
    if (!user) { showNotification('尚未登入，請稍後再試', 'error'); return; }
    try {
      const bp = ['artifacts', syncKey, 'public', 'data'];
      if (target.type === 'fixed') { await deleteDoc(doc(db, ...bp, 'fixedSchedules', target.id)); showNotification('已移除排班', 'info'); }
      else if (target.type === 'adhoc') { await deleteDoc(doc(db, ...bp, 'adhocBookings', target.id)); showNotification('已取消預約', 'info'); }
      else if (target.type === 'import') {
        const data = importData;
        const existing = await getDocs(collection(db, ...bp, 'adhocBookings'));
        const db1 = writeBatch(db); existing.docs.forEach(d => db1.delete(d.ref)); await db1.commit();
        const b2 = writeBatch(db);
        if (data?.members) data.members.forEach(m => b2.set(doc(db, ...bp, 'members', m.id), m));
        if (data?.fixedSchedules) data.fixedSchedules.forEach(f => b2.set(doc(db, ...bp, 'fixedSchedules', `${f.weekday}_${f.room}_${f.timeSlot}`), f));
        if (data?.adhocBookings) data.adhocBookings.forEach(a => {
          const id = a.startTime ? `${a.date}_${a.room}_${a.startTime}_${a.endTime}` : `${a.date}_${a.room}_${a.timeSlot}`;
          b2.set(doc(db, ...bp, 'adhocBookings', id), a);
        });
        await b2.commit();
        showNotification('雲端還原完成', 'success');
      }
    } catch (err) { showNotification('執行失敗', 'error'); }
  };

  // Loading
  if (isLoading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
      <div className="w-14 h-14 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-slate-500 text-lg font-semibold">載入中...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800 antialiased">
      {/* Toast 通知 */}
      {notification && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-[2000] px-8 py-4 flex items-center gap-3 text-white font-bold text-lg animate-slide-down ${
          notification.type === 'error' ? 'bg-red-500' : notification.type === 'success' ? 'bg-emerald-500' : 'bg-slate-700'
        }`}>
          {notification.type === 'error' ? <AlertCircle size={18}/> : notification.type === 'success' ? <CheckCircle2 size={18}/> : <AlertCircle size={18}/>}
          {notification.msg}
        </div>
      )}

      {/* Header - Flat */}
      <header className="sticky top-0 z-[500] bg-slate-900 text-white no-print">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-400 flex items-center justify-center rounded-md">
              <Sunrise className="text-white" size={22} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">談話室預約系統</h1>
          </div>
          <nav className="flex items-center gap-1 bg-slate-800 rounded-md p-1">
            {[
              {id:'calendar', icon:<CalendarIcon size={17}/>, label:'預約現況'},
              {id:'fixed', icon:<Settings size={17}/>, label:'固定排班'},
              {id:'members', icon:<Users size={17}/>, label:'人員管理'},
              {id:'reports', icon:<FileText size={17}/>, label:'報表彙整'},
              {id:'data', icon:<Save size={17}/>, label:'系統維護'}
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded transition-colors text-base ${
                  activeTab === tab.id
                    ? 'bg-white text-slate-900 font-bold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700 font-semibold'
                }`}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        <div className="max-w-full mx-auto p-6">

          {/* ===== 預約現況 ===== */}
          {activeTab === 'calendar' && (
            <div>
              <div className="flex justify-between items-center mb-5 bg-white p-5 border-2 border-slate-200 rounded-md">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                    <CalendarIcon className="text-indigo-500" size={28} /> {YEAR}年{currentMonth}月 預約狀態列表
                  </h2>
                  <div className="text-base text-slate-500 font-semibold mt-1 flex items-center gap-1.5">
                    <Link2 size={14}/> 連線金鑰: <span className="font-mono text-slate-700">{syncKey}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setCurrentMonth(m => Math.max(2, m-1))} disabled={currentMonth===2}
                    className="p-2.5 border-2 border-slate-200 hover:bg-slate-100 disabled:opacity-20 transition-colors rounded-md">
                    <ChevronLeft size={22}/>
                  </button>
                  <button onClick={() => setCurrentMonth(m => Math.min(12, m+1))} disabled={currentMonth===12}
                    className="p-2.5 border-2 border-slate-200 hover:bg-slate-100 disabled:opacity-20 transition-colors rounded-md">
                    <ChevronRight size={22}/>
                  </button>
                </div>
              </div>

              {/* 行事曆 Grid - 週末窄、週間寬 */}
              <div className="grid gap-2" style={CALENDAR_GRID_COLS}>
                {['日','一','二','三','四','五','六'].map(d => (
                  <div key={d} className="text-base font-bold text-slate-600 text-center tracking-widest mb-1">{d}</div>
                ))}
                {Array.from({length: new Date(YEAR, currentMonth - 1, 1).getDay()}).map((_, i) => (
                  <div key={i} className="h-48 bg-slate-100 border-2 border-dashed border-slate-200 rounded-md" />
                ))}
                {Array.from({length: getDaysInMonth(currentMonth)}).map((_, i) => {
                  const dateStr = formatDate(currentMonth, i + 1);
                  const holiday = isHoliday(dateStr);
                  const getRoomBookings = (room, isMorning) => {
                    const all = getBookingsForRoomDate(room, dateStr, adhocBookings, fixedSchedules);
                    return mergeConsecutiveSlots(all.filter(b => isMorning ? b.startTime < '13:00' : b.startTime >= '13:00'), members);
                  };
                  return (
                    <div key={i} onClick={() => !holiday && setSelectedDate(dateStr)}
                      className={`min-h-[12rem] p-3 border-2 rounded-md transition-colors overflow-hidden ${
                        holiday
                          ? 'bg-slate-100 border-slate-200 cursor-default'
                          : 'bg-white border-slate-200 hover:border-indigo-500 cursor-pointer'
                      }`}>
                      <span className={`text-3xl font-bold block ${holiday ? 'text-red-400' : 'text-slate-900'}`}>{i+1}</span>
                      {/* Holiday 不顯示任何內容 */}
                      {!holiday && (
                        <div className="mt-3 space-y-2.5">
                          {TIME_SLOTS.map(slot => {
                            const isMorning = slot.id === 'morning';
                            const items = ROOMS.flatMap(r => {
                              const bks = getRoomBookings(r, isMorning);
                              return bks.map(b => ({ room: r, isAdhoc: !!b.ahId, userId: b.userId, timeRange: formatTimeRange(b.startTime, b.endTime) }));
                            });
                            if (items.length === 0) return null;
                            return (
                              <div key={slot.id}>
                                <div className="text-sm font-bold text-slate-700 uppercase tracking-widest flex items-center gap-1.5 mb-1.5 pb-1 border-b-2 border-slate-200">
                                  {slot.id === 'morning' ? <Sunrise className="text-amber-500" size={13}/> : <Sunset className="text-indigo-500" size={13}/>} {slot.label}
                                </div>
                                <div className="space-y-1">
                                  {items.map((item, idx) => (
                                    <div key={idx} className={`px-2.5 py-1.5 flex justify-between items-center border-l-4 ${
                                      item.isAdhoc ? 'bg-amber-50 text-amber-900 border-amber-400' : 'bg-indigo-50 text-indigo-900 border-indigo-400'
                                    }`}>
                                      <div className="flex flex-col">
                                        <span className="font-bold text-base text-slate-800">{item.room}</span>
                                        <span className="text-sm text-slate-600 font-semibold">{item.timeRange}</span>
                                      </div>
                                      <span className="text-lg font-bold text-slate-900">{getMemberDisplayName(item.userId, members)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ===== 固定排班 ===== */}
          {activeTab === 'fixed' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold flex items-center gap-3 text-emerald-700">
                <Settings size={26}/> 固定排班管理
              </h2>
              <div className="bg-white p-6 border-2 border-slate-200 rounded-md flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-base font-bold text-slate-700 mb-2 block">選擇人員</label>
                  <select className="w-full border-2 border-slate-300 rounded-md p-3 font-bold text-lg bg-white text-slate-900 outline-none" id="fx-u">
                    <option value="">選擇人員...</option>
                    {members.filter(m=>m.type==='probation_officer').map(m=><option key={m.id} value={m.id}>{getMemberDisplayName(m.id, members)}</option>)}
                  </select>
                </div>
                <div className="w-40">
                  <label className="text-base font-bold text-slate-700 mb-2 block">固定星期</label>
                  <select className="w-full border-2 border-slate-300 rounded-md p-3 font-bold text-lg bg-white text-slate-900 outline-none" id="fx-d">
                    {[1,2,3,4,5].map(d=><option key={d} value={d}>星期{['日','一','二','三','四','五','六'][d]}</option>)}
                  </select>
                </div>
                <div className="w-36">
                  <label className="text-base font-bold text-slate-700 mb-2 block">時段</label>
                  <select className="w-full border-2 border-slate-300 rounded-md p-3 font-bold text-lg bg-white text-slate-900 outline-none" id="fx-t">
                    {TIME_SLOTS.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
                <div className="w-44">
                  <label className="text-base font-bold text-slate-700 mb-2 block">會議室</label>
                  <select className="w-full border-2 border-slate-300 rounded-md p-3 font-bold text-lg bg-white text-slate-900 outline-none" id="fx-r">
                    {ROOMS.map(r=><option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <button onClick={() => { const u=document.getElementById('fx-u').value, t=document.getElementById('fx-t').value; if(u) handleAddFixed(u, parseInt(document.getElementById('fx-d').value), document.getElementById('fx-r').value, t); }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3.5 rounded-md font-bold transition-colors active:scale-95 text-lg">
                  同步排班
                </button>
              </div>
              <div className="bg-white border-2 border-slate-200 rounded-md overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b-2 border-slate-200">
                    <tr>
                      <th className="px-6 py-4 font-bold text-lg text-slate-700">日期與時段</th>
                      <th className="px-6 py-4 font-bold text-lg text-slate-700">空間</th>
                      <th className="px-6 py-4 font-bold text-lg text-slate-700">使用者</th>
                      <th className="px-6 py-4 font-bold text-lg text-slate-700 w-20">管理</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-slate-100">
                    {fixedSchedules.sort((a,b)=>a.weekday-b.weekday).map(f=>(
                      <tr key={f.fsId} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-bold text-lg text-slate-900">每週{['日','一','二','三','四','五','六'][f.weekday]} <span className="text-slate-600">({TIME_SLOTS.find(s=>s.id===f.timeSlot)?.label || f.timeSlot})</span></td>
                        <td className="px-6 py-4 text-lg font-semibold text-slate-800">{f.room}</td>
                        <td className="px-6 py-4 font-bold text-xl text-indigo-800">{getMemberDisplayName(f.userId, members)}</td>
                        <td className="px-6 py-4">
                          <button onClick={()=>setDeleteTarget({type:'fixed',id:f.fsId,label:`星期${['日','一','二','三','四','五','六'][f.weekday]} ${TIME_SLOTS.find(s=>s.id===f.timeSlot)?.label || f.timeSlot} ${f.room}`})}
                            className="text-slate-400 hover:text-red-500 p-2 hover:bg-red-50 transition-colors rounded-md">
                            <Trash2 size={18}/>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== 人員管理 ===== */}
          {activeTab === 'members' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold flex items-center gap-3 text-violet-700">
                <Users size={26}/> 人員編制管理
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {members.sort((a,b)=>a.id.localeCompare(b.id)).map(m=><MemberInput key={m.id} member={m} onUpdate={updateMemberName}/>)}
              </div>
            </div>
          )}

          {/* ===== 報表 ===== */}
          {activeTab === 'reports' && <ReportSection currentMonth={currentMonth} setCurrentMonth={setCurrentMonth} members={members} adhocBookings={adhocBookings} fixedSchedules={fixedSchedules} showNotification={showNotification} />}

          {/* ===== 系統維護 ===== */}
          {activeTab === 'data' && (
            <div className="max-w-3xl mx-auto space-y-5">
              <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                <Save size={24}/> 系統維護
              </h2>
              <div className="bg-indigo-900 text-white p-6 rounded-md">
                <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
                  <Link2 size={18}/> 共享金鑰連線
                </h3>
                <p className="text-indigo-200 text-base mb-4">輸入金鑰即可在多台主機間同步數據。</p>
                <div className="flex gap-3">
                  <input className="flex-1 bg-white/15 border-2 border-white/30 rounded-md px-4 py-2.5 text-lg font-mono text-white outline-none focus:bg-white/25 focus:border-white/50 transition-colors placeholder:text-white/40"
                    value={tempSyncKey} onChange={e=>setTempSyncKey(e.target.value)} placeholder="自定義金鑰" />
                  <button onClick={()=>{localStorage.setItem('meeting_sync_key',tempSyncKey);setSyncKey(tempSyncKey);showNotification('金鑰更新完成','success');}}
                    className="bg-white text-indigo-900 px-6 py-2.5 rounded-md font-bold text-lg hover:bg-indigo-50 transition-colors">
                    切換
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button onClick={()=>{
                  const data={members,fixedSchedules,adhocBookings,syncKey,exportAt:new Date().toISOString()};
                  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
                  const url=URL.createObjectURL(blob); const a=document.createElement('a');a.href=url;a.download=`backup_${syncKey}.json`;a.click();
                  showNotification('備份下載完成','success');
                }} className="bg-white p-5 rounded-md flex items-center gap-4 text-slate-700 border-2 border-slate-200 hover:border-indigo-400 transition-colors group">
                  <div className="w-12 h-12 bg-indigo-100 flex items-center justify-center rounded-md">
                    <Download className="text-indigo-600" size={24} />
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-lg text-slate-900">下載資料備份</div>
                    <div className="text-base text-slate-600 mt-0.5">匯出 JSON 檔案至本機</div>
                  </div>
                </button>
                <button onClick={()=>fileInputRef.current.click()} className="bg-white p-5 rounded-md flex items-center gap-4 text-slate-700 border-2 border-slate-200 hover:border-amber-400 transition-colors group">
                  <div className="w-12 h-12 bg-amber-100 flex items-center justify-center rounded-md">
                    <Upload className="text-amber-600" size={24} />
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-lg text-slate-900">還原雲端資料</div>
                    <div className="text-base text-slate-600 mt-0.5">從 JSON 備份還原</div>
                  </div>
                </button>
                <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={e=>{
                  const reader=new FileReader();
                  reader.onload=ev=>{ setPendingImportData(JSON.parse(ev.target.result)); setDeleteTarget({type:'import',label:'覆蓋雲端資料庫'}); };
                  reader.readAsText(e.target.files[0]); e.target.value='';
                }} />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ===== 預約詳情 Modal ===== */}
      {selectedDate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[3000] animate-fade-in">
          <div className="bg-white rounded-md w-full max-w-7xl overflow-hidden flex flex-col h-[92vh] animate-scale-in border-2 border-slate-300">
            <div className="bg-indigo-600 px-6 py-3.5 text-white flex justify-between items-center shrink-0">
              <h3 className="text-2xl font-bold tracking-tight">{selectedDate.replace(/-/g, ' / ')} 預約狀態</h3>
              <button onClick={()=>setSelectedDate(null)} className="w-9 h-9 bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors rounded-md">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 grid grid-cols-3 divide-x-2 divide-slate-100 overflow-hidden">
              {/* 上午 */}
              <div className="flex flex-col p-4 overflow-hidden">
                <h4 className="font-bold text-slate-900 text-lg tracking-wide flex items-center gap-2 border-b-3 border-amber-400 pb-2 mb-3 shrink-0" style={{borderBottomWidth:'3px'}}>
                  <Sunrise className="text-amber-500" size={22}/> 上午 (08:00-12:00)
                </h4>
                <div className="flex-1 overflow-y-auto custom-scroll space-y-1.5 pr-1">
                  {ROOMS.map(rm => {
                    const all = getBookingsForRoomDate(rm, selectedDate, adhocBookings, fixedSchedules);
                    const morning = mergeConsecutiveSlots(all.filter(b => b.startTime < '13:00'), members);
                    return (
                      <div key={rm} onClick={() => { setFormRoom(rm); setFormStartTime('08:00'); setFormEndTime('12:00'); }}
                        className="flex flex-col px-3 py-2 bg-slate-50 border-2 border-slate-100 hover:border-amber-400 hover:bg-white cursor-pointer transition-colors rounded-md">
                        <span className="font-bold text-lg text-slate-800">{rm}</span>
                        {morning.length > 0 ? (
                          <div className="mt-1.5 space-y-1">
                            {morning.map((b, idx) => (
                              <div key={idx} className="flex items-center justify-between gap-2">
                                <span className="text-base text-slate-600 font-bold">{formatTimeRange(b.startTime, b.endTime)}</span>
                                <span className="text-lg px-2.5 py-0.5 font-bold bg-indigo-100 text-indigo-900 border border-indigo-300 rounded-sm">{getMemberDisplayName(b.userId, members)}</span>
                                {b.ahId && <button onClick={e=>{e.stopPropagation();setDeleteTarget({type:'adhoc',id:b.ahId,label:`${selectedDate} ${formatTimeRange(b.startTime,b.endTime)} ${rm}`});}} className="text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={15}/></button>}
                              </div>
                            ))}
                          </div>
                        ) : <span className="text-sm text-emerald-700 font-bold px-2.5 py-1 bg-emerald-50 border border-emerald-300 mt-1 self-start">開放</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* 下午 */}
              <div className="flex flex-col p-4 overflow-hidden">
                <h4 className="font-bold text-slate-900 text-lg tracking-wide flex items-center gap-2 pb-2 mb-3 shrink-0" style={{borderBottomWidth:'3px', borderBottomColor:'#818cf8', borderBottomStyle:'solid'}}>
                  <Sunset className="text-indigo-500" size={22}/> 下午 (13:00-17:00)
                </h4>
                <div className="flex-1 overflow-y-auto custom-scroll space-y-1.5 pr-1">
                  {ROOMS.map(rm => {
                    const all = getBookingsForRoomDate(rm, selectedDate, adhocBookings, fixedSchedules);
                    const afternoon = mergeConsecutiveSlots(all.filter(b => b.startTime >= '13:00'), members);
                    return (
                      <div key={rm} onClick={() => { setFormRoom(rm); setFormStartTime('13:00'); setFormEndTime('17:00'); }}
                        className="flex flex-col px-3 py-2 bg-slate-50 border-2 border-slate-100 hover:border-indigo-400 hover:bg-white cursor-pointer transition-colors rounded-md">
                        <span className="font-bold text-lg text-slate-800">{rm}</span>
                        {afternoon.length > 0 ? (
                          <div className="mt-1.5 space-y-1">
                            {afternoon.map((b, idx) => (
                              <div key={idx} className="flex items-center justify-between gap-2">
                                <span className="text-base text-slate-600 font-bold">{formatTimeRange(b.startTime, b.endTime)}</span>
                                <span className="text-lg px-2.5 py-0.5 font-bold bg-indigo-100 text-indigo-900 border border-indigo-300 rounded-sm">{getMemberDisplayName(b.userId, members)}</span>
                                {b.ahId && <button onClick={e=>{e.stopPropagation();setDeleteTarget({type:'adhoc',id:b.ahId,label:`${selectedDate} ${formatTimeRange(b.startTime,b.endTime)} ${rm}`});}} className="text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={15}/></button>}
                              </div>
                            ))}
                          </div>
                        ) : <span className="text-sm text-emerald-700 font-bold px-2.5 py-1 bg-emerald-50 border border-emerald-300 mt-1 self-start">開放</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* 預約登記 */}
              <div className="flex flex-col p-4 bg-slate-50 justify-start">
                <div className="p-5 border-2 border-dashed bg-white border-indigo-300 rounded-md">
                  <div className="flex items-center gap-2.5 mb-5">
                    <div className="w-9 h-9 bg-indigo-100 flex items-center justify-center rounded-md">
                      <UserPlus className="text-indigo-600" size={20}/>
                    </div>
                    <h4 className="text-2xl font-bold text-slate-900">預約登記</h4>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="text-base font-bold text-slate-800 uppercase tracking-wider mb-1.5 block">談話室</label>
                      <select value={formRoom} onChange={e=>setFormRoom(e.target.value)}
                        className="w-full border-2 border-slate-300 rounded-md p-3 font-bold text-lg bg-white outline-none text-slate-900 focus:border-indigo-500 transition-colors">
                        {ROOMS.map(x=><option key={x} value={x}>{x}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-base font-bold text-slate-800 uppercase tracking-wider mb-1.5 block">快速選擇</label>
                      <div className="flex gap-2">
                        <button onClick={() => { setFormStartTime('08:00'); setFormEndTime('12:00'); }}
                          className={`flex-1 py-3 rounded-md font-bold text-lg border-2 transition-colors ${formStartTime==='08:00'&&formEndTime==='12:00' ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-50 text-amber-800 border-amber-300 hover:border-amber-500'}`}>
                          <Sunrise size={16} className="inline mr-1"/> 上午
                        </button>
                        <button onClick={() => { setFormStartTime('13:00'); setFormEndTime('17:00'); }}
                          className={`flex-1 py-3 rounded-md font-bold text-lg border-2 transition-colors ${formStartTime==='13:00'&&formEndTime==='17:00' ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-indigo-50 text-indigo-800 border-indigo-300 hover:border-indigo-500'}`}>
                          <Sunset size={14} className="inline mr-1"/> 下午
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-base font-bold text-slate-800 uppercase tracking-wider mb-1.5 block">開始</label>
                        <select value={formStartTime} onChange={e=>setFormStartTime(e.target.value)}
                          className="w-full border-2 border-slate-300 rounded-md p-3 font-bold text-lg bg-white outline-none text-slate-900 focus:border-indigo-500">
                          {ALL_HOURS.slice(0,-1).map(h=><option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-base font-bold text-slate-800 uppercase tracking-wider mb-1.5 block">結束</label>
                        <select value={formEndTime} onChange={e=>setFormEndTime(e.target.value)}
                          className="w-full border-2 border-slate-300 rounded-md p-3 font-bold text-lg bg-white outline-none text-slate-900 focus:border-indigo-500">
                          {ALL_HOURS.filter(h=>h>formStartTime).map(h=><option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-base font-bold text-slate-800 uppercase tracking-wider mb-1.5 block">人員</label>
                      <select value={formUser} onChange={e=>setFormUser(e.target.value)}
                        className="w-full border-2 border-slate-300 rounded-md p-3 font-bold text-lg bg-white outline-none text-slate-900 focus:border-indigo-500">
                        <option value="">選取預約人員...</option>
                        {members.sort((a,b)=>a.id.localeCompare(b.id)).map(m=><option key={m.id} value={m.id}>{getMemberDisplayName(m.id, members)}</option>)}
                      </select>
                    </div>
                    {(() => {
                      const conflict = hasConflict(formRoom, selectedDate, formStartTime, formEndTime, adhocBookings, fixedSchedules);
                      const invalidTime = formStartTime >= formEndTime;
                      const disabled = !formUser || conflict || invalidTime;
                      return (
                        <button disabled={disabled}
                          onClick={()=>{ handleAddAdhoc(selectedDate, formRoom, formUser, formStartTime, formEndTime); setSelectedDate(null); setFormUser(""); }}
                          className={`w-full py-4 rounded-md font-bold text-lg transition-colors mt-2 ${
                            disabled ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.98]'
                          }`}>
                          {conflict ? '⚠ 時段佔用中' : invalidTime ? '⚠ 時間無效' : '確認預約'}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== 驗證 Modal ===== */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-8 z-[5000] animate-fade-in">
          <div className="bg-white rounded-md w-full max-w-sm p-8 animate-scale-in border-2 border-slate-300">
            <div className={`w-16 h-16 ${deleteTarget.type==='import'?'bg-amber-100 text-amber-600':'bg-red-100 text-red-500'} flex items-center justify-center mb-6 mx-auto rounded-md`}>
              <Lock size={32}/>
            </div>
            <h3 className="text-xl font-bold text-slate-800 text-center mb-2">安全管理驗證</h3>
            <p className="text-slate-600 text-lg text-center mb-6 leading-relaxed">
              執行項目：<br/>
              <span className="font-bold text-slate-900 mt-1 inline-block">{deleteTarget.label}</span>
            </p>
            <input type="password" value={passwordInput} onChange={e=>setPasswordInput(e.target.value)}
              className="w-full border-b-4 border-slate-200 p-3 text-center text-3xl tracking-[0.4em] outline-none focus:border-indigo-500 transition-colors bg-transparent font-mono text-slate-800 mb-3"
              placeholder="••••" autoFocus
              onKeyDown={e=>{ if(e.key==='Enter'){if(passwordInput===DELETE_PASSWORD){executeAuthAction();}else{showNotification('密碼錯誤','error');}} }}
            />
            <div className="grid grid-cols-2 gap-4 mt-8">
              <button onClick={()=>{setDeleteTarget(null);setPendingImportData(null);}}
                className="py-3 rounded-md font-bold text-slate-600 hover:bg-slate-100 transition-colors text-lg">
                取消
              </button>
              <button onClick={()=>{if(passwordInput===DELETE_PASSWORD){executeAuthAction();}else{showNotification('密碼錯誤','error');}}}
                className={`py-3 rounded-md font-bold text-white ${
                  deleteTarget.type==='import'?'bg-amber-500 hover:bg-amber-600':'bg-red-500 hover:bg-red-600'
                } active:scale-[0.98] transition-colors text-lg`}>
                確認執行
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideDown { from{opacity:0;transform:translateY(-12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes scaleIn { from{opacity:0;transform:scale(0.97)} to{opacity:1;transform:scale(1)} }
        .animate-slide-down{animation:slideDown .3s ease-out}
        .animate-fade-in{animation:fadeIn .15s ease-out}
        .animate-scale-in{animation:scaleIn .2s ease-out}
        .custom-scroll::-webkit-scrollbar{width:5px}
        .custom-scroll::-webkit-scrollbar-track{background:transparent}
        .custom-scroll::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:10px}
        .custom-scroll::-webkit-scrollbar-thumb:hover{background:#94a3b8}
        @media print{.no-print{display:none!important}}
      `}</style>
    </div>
  );
};

export default App;
