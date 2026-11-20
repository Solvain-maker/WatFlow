import { useState } from 'react'
import { useEffect as useReactEffect } from 'react'
import { BrowserRouter, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  Activity, AlertTriangle, BarChart3, Bell, Bolt, ChevronLeft, Download, Droplets, Gauge,
  Languages, LayoutDashboard, Leaf, Lightbulb, Menu, Plus, Printer,
  Search, Settings, ShieldCheck, Trash2, Waves, X, Zap,
} from 'lucide-react'
import './App.css'

type Lang = 'ar' | 'fr'
type Mode = 'normal' | 'water' | 'electric'
type Equipment = { id: number; name: string; type: string; location: string; resource: string; normal: number; threshold: number; status: 'normal' | 'warning' | 'danger' | 'offline' }

const api = async (path: string, init?: RequestInit) => {
  const token = localStorage.getItem('dlww-token')
  const response = await fetch(`/api${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers } })
  if (!response.ok) throw new Error(`API ${response.status}`)
  return response.status === 204 ? null : response.json()
}
const mapEquipment = (row: any): Equipment => ({ id: row.id, name: row.name, type: row.category || row.type, location: row.location, resource: row.resource_type || row.resource, normal: row.normal_consumption ?? row.normal, threshold: row.threshold, status: row.status })
const aggregateReadings = (rows: any[]) => {
  const days = new Map<string, { day: string; date: string; water: number; electric: number }>()
  rows.forEach(row => {
    const key = String(row.timestamp).slice(0, 10)
    const entry = days.get(key) || { day: new Date(key + 'T12:00:00').toLocaleDateString('ar-MA', { weekday: 'short' }), date:key, water: 0, electric: 0 }
    if (row.resource_type === 'water') entry.water += Number(row.consumption_value)
    if (row.resource_type === 'electric') entry.electric += Number(row.consumption_value)
    days.set(key, entry)
  })
  return [...days.values()].slice(-7)
}

const week = [
  { day: 'السبت', water: 8.8, electric: 43 }, { day: 'الأحد', water: 9.4, electric: 46 },
  { day: 'الاثنين', water: 8.1, electric: 42 }, { day: 'الثلاثاء', water: 11.2, electric: 49 },
  { day: 'الأربعاء', water: 9.7, electric: 45 }, { day: 'الخميس', water: 10.1, electric: 47 },
  { day: 'الجمعة', water: 9.6, electric: 44 },
]

const initialEquipment: Equipment[] = [
  { id: 1, name: 'مضخة المياه الرئيسية', type: 'مضخة', location: 'غرفة المضخات', resource: 'كهرباء وماء', normal: 4.5, threshold: 7.2, status: 'normal' },
  { id: 2, name: 'نظام الري', type: 'ري', location: 'المزرعة', resource: 'ماء', normal: 12, threshold: 18, status: 'normal' },
  { id: 3, name: 'خزان المياه', type: 'خزان', location: 'الساحة', resource: 'ماء', normal: 70, threshold: 85, status: 'warning' },
  { id: 4, name: 'إنارة الورشة', type: 'إضاءة', location: 'ورشة العمل', resource: 'كهرباء', normal: 2.1, threshold: 3.5, status: 'normal' },
  { id: 5, name: 'المعدات الفلاحية', type: 'معدات', location: 'المحطة الزراعية', resource: 'كهرباء', normal: 6.4, threshold: 9, status: 'normal' },
]

function App() {
  const [lang, setLang] = useState<Lang>('ar')
  const [authenticated,setAuthenticated]=useState(()=>Boolean(localStorage.getItem('dlww-token')))
  const [mode, setMode] = useState<Mode>('normal')
  const [running, setRunning] = useState(false)
  const [simulationMinutes, setSimulationMinutes] = useState(0)
  const [equipment, setEquipment] = useState(initialEquipment)
  const [chartWeek, setChartWeek] = useState(week)
  const [resolved, setResolved] = useState(false)
  const [waterTariff, setWaterTariff] = useState(8.5)
  const [electricTariff, setElectricTariff] = useState(1.6)
  const [currency,setCurrency]=useState('DH')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [activeAlertId, setActiveAlertId] = useState<number | null>(null)

  useReactEffect(() => {
    api('/equipment').then((rows: any[]) => setEquipment(rows.map(mapEquipment))).catch(() => {})
    api('/consumption').then((rows: any[]) => { const totals = aggregateReadings(rows); if (totals.length) setChartWeek(totals) }).catch(() => {})
  }, [])

  useReactEffect(() => {
    if (!running || mode === 'normal') return
    const timer = window.setInterval(() => setSimulationMinutes(value => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [running, mode])

  const waterFlow = mode === 'water' ? 10 : 2
  const waterWasted = mode === 'water' ? 8 * simulationMinutes : 0
  const electricWaste = mode === 'electric' ? 0.09 * simulationMinutes : 0
  const waterLossCost = (waterWasted / 1000) * waterTariff
  const electricLossCost = electricWaste * electricTariff
  const totalLoss = waterLossCost + electricLossCost

  const simulatedWeek = chartWeek.map((d, i) => ({
    ...d,
    water: mode === 'water' && i === 6 ? d.water + waterWasted / 1000 : d.water,
    electric: mode === 'electric' && i === 6 ? d.electric + electricWaste : d.electric,
  }))

  const toggleLang = () => setLang(lang === 'ar' ? 'fr' : 'ar')

  const startScenario = async (nextMode: Mode) => {
    setMode(nextMode); setResolved(false); setRunning(true); setSimulationMinutes(nextMode === 'normal' ? 0 : 30)
    if (nextMode === 'normal') { await resolveProblem(); return }
    const pump = equipment.find(item => item.name.includes('مضخة'))
    const water = nextMode === 'water'
    try {
      const alert = await api('/alerts', { method: 'POST', body: JSON.stringify({ equipment_id: pump?.id, alert_type: water ? 'water_leak' : 'electric_waste', severity: water ? 'مرتفع' : 'متوسط', description: water ? 'ارتفاع تدفق المياه من 2 إلى 10 لتر/دقيقة لمدة 30 دقيقة.' : 'تشغيل المضخة خارج أوقات العمل، باستهلاك إضافي 2.7 kWh.', estimated_loss: water ? (8 * 30 / 1000) * waterTariff : 2.7 * electricTariff }) })
      setActiveAlertId(alert.id)
      if (pump) {
        setEquipment(equipment.map(item => item.id === pump.id ? { ...item, status: 'danger' } : item))
        await api(`/equipment/${pump.id}`, { method: 'PUT', body: JSON.stringify({ ...pump, status: 'danger' }) })
      }
    } catch { /* Keep the demo interactive if the API server is not running. */ }
  }

  const resolveProblem = async () => {
    const resolvedMode=mode
    setMode('normal'); setResolved(true); setRunning(false); setSimulationMinutes(0)
    if (activeAlertId) api(`/alerts/${activeAlertId}`, { method: 'PATCH', body: JSON.stringify({ status: 'resolved', estimated_loss: totalLoss }) }).catch(() => {})
    const affectedBefore=equipment.find(item=>item.status==='danger')||equipment.find(item=>item.name.includes('مضخة'))
    if (affectedBefore&&resolvedMode!=='normal') {
      api('/consumption',{method:'POST',body:JSON.stringify({equipment_id:affectedBefore.id,resource_type:resolvedMode==='water'?'water':'electric',consumption_value:resolvedMode==='water'?waterWasted/1000:electricWaste,measurement_unit:resolvedMode==='water'?'m3':'kWh',simulation_flag:1})})
        .then(()=>api('/consumption')).then((rows:any[])=>{const totals=aggregateReadings(rows);if(totals.length)setChartWeek(totals)}).catch(()=>{})
    }
    setActiveAlertId(null)
    const affected = equipment.find(item => item.status === 'danger')
    if (affected) {
      setEquipment(equipment.map(item => item.id === affected.id ? { ...item, status: 'normal' } : item))
      api(`/equipment/${affected.id}`, { method: 'PUT', body: JSON.stringify({ ...affected, status: 'normal' }) }).catch(() => {})
    }
  }

  return (
    <BrowserRouter>
      <div className={lang === 'ar' ? 'app rtl' : 'app ltr'} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <Routes>
          <Route path="/" element={<Landing lang={lang} toggleLang={toggleLang} />} />
          <Route path="/login" element={<Login lang={lang} toggleLang={toggleLang} onAuthenticated={()=>setAuthenticated(true)} />} />
          <Route path="/app/*" element={authenticated ? <Shell
            lang={lang} toggleLang={toggleLang} mode={mode} running={running} setRunning={setRunning}
            setMode={setMode} equipment={equipment} setEquipment={setEquipment} resolved={resolved}
            waterFlow={waterFlow} waterWasted={waterWasted} electricWaste={electricWaste} simulationMinutes={simulationMinutes}
            waterLossCost={waterLossCost} electricLossCost={electricLossCost} totalLoss={totalLoss}
            simulatedWeek={simulatedWeek} resolveProblem={resolveProblem} startScenario={startScenario} waterTariff={waterTariff}
            electricTariff={electricTariff} setWaterTariff={setWaterTariff} setElectricTariff={setElectricTariff}
            currency={currency} setCurrency={setCurrency}
            mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} onLogout={()=>{localStorage.removeItem('dlww-token');setAuthenticated(false)}}
          /> : <Navigate to="/login" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

function Landing({ lang, toggleLang }: { lang: Lang; toggleLang: () => void }) {
  const navigate = useNavigate()
  return <div className="landing">
    <nav className="public-nav">
      <button className="brand" onClick={() => navigate('/')}><img className="brand-symbol brand-full-logo" src="/watflow-logo.png" alt="WatFlow"/></button>
      <div className="nav-actions">
        <button className="text-btn" onClick={toggleLang}><Languages size={18}/>{lang === 'ar' ? 'FR' : 'AR'}</button>
        <button className="btn ghost" onClick={() => navigate('/login')}>{lang === 'ar' ? 'تسجيل الدخول' : 'Connexion'}</button>
        <button className="btn primary" onClick={() => navigate('/app/dashboard')}>{lang === 'ar' ? 'جرب النموذج' : 'Essayer'}</button>
      </div>
    </nav>
    <header className="hero-section">
      <div className="hero-copy">
        <div className="eyebrow"><span className="pulse-dot"/>حل مبتكر مغربي للترشيد الذكي</div>
        <h1>{lang === 'ar' ? <>راقب استهلاكك،<br/><span>اكتشف الهدر، ووفّر أموالك.</span></> : <>Surveillez votre consommation,<br/><span>détectez le gaspillage.</span></>}</h1>
        <p>{lang === 'ar' ? 'حل رقمي ذكي يساعد التعاونيات والضيعات والأنشطة المهنية في المغرب على مراقبة الماء والكهرباء واكتشاف الهدر قبل أن يتحول إلى خسائر مالية.' : 'Une solution intelligente pour surveiller l’eau et l’électricité des activités professionnelles au Maroc.'}</p>
        <div className="hero-actions"><button className="btn primary large" onClick={() => document.getElementById('solution')?.scrollIntoView({behavior:'smooth'})}>{lang === 'ar' ? 'اكتشف كيف يعمل المشروع' : 'Découvrir'} <ChevronLeft size={18}/></button><button className="btn outline large" onClick={() => navigate('/app/simulation')}>{lang === 'ar' ? 'تجربة التطبيق' : 'Démo interactive'}</button></div>
        <div className="trust-row"><span><ShieldCheck size={17}/>بيانات محاكاة واضحة</span><span><Leaf size={17}/>حل مستدام وقابل للتطوير</span></div>
      </div>
      <div className="hero-visual">
        <div className="orbit orbit-one"/><div className="orbit orbit-two"/>
        <div className="monitor-card">
          <div className="monitor-top"><div><small>الاستهلاك اليومي</small><strong>67.4 m³</strong></div><span className="status-chip"><span/>نشط</span></div>
          <div className="mini-chart"><div className="chart-bars">{[42,58,48,72,62,86,68,92,76,88].map((h,i)=><span key={i} style={{height:`${h}%`}} />)}</div></div>
          <div className="monitor-grid"><div><Droplets size={18}/><span>الماء</span><strong>9.6 m³</strong></div><div><Zap size={18}/><span>الكهرباء</span><strong>44 kWh</strong></div></div>
        </div>
        <div className="float-alert"><AlertTriangle size={21}/><div><small>تنبيه تجريبي</small><strong>اكتشاف تدفق غير طبيعي</strong></div></div>
      </div>
    </header>
    <section className="problem-section" id="solution"><div className="section-heading"><span>01 — المشكلة والحل</span><h2>من المفاجأة بالفواتير إلى التدخل المبكر</h2></div><div className="problem-grid"><article><div className="icon-box red"><AlertTriangle/></div><h3>المشكلة</h3><p>غالباً لا يُكتشف التسرب أو الاستهلاك غير المبرر إلا بعد وصول فاتورة مرتفعة.</p></article><article><div className="icon-box teal"><Activity/></div><h3>التتبع الذكي</h3><p>قياس الاستهلاك وتحليل أنماط الاستخدام باستمرار عبر واجهة موحدة.</p></article><article><div className="icon-box orange"><Lightbulb/></div><h3>التوفير المباشر</h3><p>تنبيهات وحلول عملية تقلل الهدر وتساعد على اتخاذ القرار فوراً.</p></article></div></section>
    <section className="features-section"><div className="section-heading"><span>02 — المميزات</span><h2>نظرة شاملة لكل مورد ومعدة</h2></div><div className="feature-grid">{[
      [Droplets,'مراقبة المياه','تتبع التدفق والاستهلاك اليومي والشهري'],[Zap,'مراقبة الكهرباء','كشف الاستهلاك خارج أوقات التشغيل'],[Bell,'تنبيهات ذكية','إشعارات حسب مستوى الخطورة'],[BarChart3,'تحليلات وتقارير','رسوم تفاعلية وتقارير قابلة للتصدير'],[Gauge,'حساب الخسائر','تقدير التكلفة المالية للماء والهدر'],[Leaf,'تقارير شهرية','متابعة أثر التدخل والتوفير البيئي']
    ].map(([Icon,title,text]: any)=><article key={title}><div className="feature-icon"><Icon size={22}/></div><h3>{title}</h3><p>{text}</p></article>)}</div></section>
    <section className="audience-section"><div><span className="eyebrow">مناسب لمختلف الأنشطة</span><h2>مصمم للاحتياجات المحلية في المغرب</h2></div><div className="audience-list"><span>تعاونيات فلاحية</span><span>ضيعات صغيرة</span><span>مغاسل</span><span>ورشات حرفية</span><span>محلات تجارية</span><span>مقاولات صغيرة</span></div></section>
  </div>
}

function Login({ lang, toggleLang, onAuthenticated }: { lang: Lang; toggleLang: () => void; onAuthenticated:()=>void }) {
  const navigate = useNavigate(); const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [name,setName]=useState(''); const [businessName,setBusinessName]=useState(''); const [businessType,setBusinessType]=useState(''); const [city,setCity]=useState(''); const [registering,setRegistering]=useState(false); const [error,setError]=useState('')
  const french=lang==='fr'
  const login=async(demo=false)=>{setError('');if(registering&&(!businessType||!city)){setError(french?'Choose the business type and city.':'اختر نوع النشاط والمدينة.');return}try{const path=registering?'/auth/register':'/auth/login';const result=await api(path,{method:'POST',body:JSON.stringify({name,email:demo?'demo@dlww.ma':email,password:demo?'Demo123!':password,business_name:businessName,business_type:businessType,city})});localStorage.setItem('dlww-token',result.token);onAuthenticated();navigate('/app/dashboard')}catch{setError(french?'Connexion ou création du compte impossible. Vérifiez les informations et le serveur.':'تعذر تسجيل الدخول أو إنشاء الحساب. تحقق من البيانات ومن تشغيل خادم التطبيق.')}}
  return <main className="login-page"><div className="login-brand"><button className="brand" onClick={()=>navigate('/')}><img className="brand-symbol brand-full-logo" src="/watflow-logo.png" alt="WatFlow"/></button></div>
    <button className="login-lang" onClick={toggleLang}><Languages size={17}/>{lang==='ar'?'FR':'AR'}</button>
    <div className="login-card"><div className="login-icon"><ShieldCheck/></div><h1>{french?'Bon retour':'مرحباً بعودتك'}</h1><p>{french?'Connectez-vous pour suivre la consommation de votre entreprise':'سجل الدخول لمتابعة استهلاك مؤسستك'}</p>
      {registering&&<><label>{french?'Nom complet':'الاسم الكامل'}<input value={name} onChange={e=>setName(e.target.value)} required/></label><label>{french?'Entreprise':'اسم المؤسسة'}<input value={businessName} onChange={e=>setBusinessName(e.target.value)} required/></label><label>{french?'Business type':'نوع النشاط'}<select value={businessType} onChange={e=>setBusinessType(e.target.value)} required><option value="">{french?'Choose a type':'اختر نوع النشاط'}</option><option value="تعاونية فلاحية">{french?'Agricultural cooperative':'تعاونية فلاحية'}</option><option value="ضيعة فلاحية">{french?'Small farm':'ضيعة فلاحية'}</option><option value="مغسلة">{french?'Laundry':'مغسلة'}</option><option value="ورشة حرفية">{french?'Craft workshop':'ورشة حرفية'}</option><option value="محل تجاري">{french?'Shop':'محل تجاري'}</option><option value="نشاط مهني">{french?'Other activity':'نشاط آخر'}</option></select></label><label>{french?'City':'المدينة'}<select value={city} onChange={e=>setCity(e.target.value)} required><option value="">{french?'Choose a city':'اختر المدينة'}</option>{[['العيون','Laayoune'],['الدار البيضاء','Casablanca'],['الرباط','Rabat'],['أكادير','Agadir'],['مراكش','Marrakech'],['فاس','Fes'],['طنجة','Tangier'],['الداخلة','Dakhla'],['كلميم','Guelmim'],['وجدة','Oujda'],['سطات','Settat'],['بني ملال','Beni Mellal'],['مكناس','Meknes'],['الصويرة','Essaouira']].map(([value,label])=><option key={value} value={value}>{french?label:value}</option>)}</select></label></>}
      <label>{french?'Adresse e-mail':'البريد الإلكتروني'}<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="demo@dlww.ma"/></label>
      <label>{french?'Mot de passe':'كلمة المرور'}<input type="password" minLength={registering?8:1} value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"/></label>
      {error && <div className="form-error">{error}</div>}<button className="btn primary login-submit" onClick={()=>login()}>{registering?(french?'Créer un compte':'إنشاء حساب'):french?'Se connecter':'تسجيل الدخول'}</button>
      {!registering&&<button className="demo-login" onClick={()=>login(true)}>{french?'Accéder à la démo':'الدخول للنسخة التجريبية'} <span>demo@dlww.ma · Demo123!</span></button>}
      <button className="demo-login" onClick={()=>{setRegistering(!registering);setError('')}}>{registering?(french?'J’ai déjà un compte':'لدي حساب بالفعل'):(french?'Créer un compte':'إنشاء حساب جديد')}</button>
    </div></main>
}

type ShellProps = {
  lang:Lang; toggleLang:()=>void; mode:Mode; running:boolean; setRunning:(v:boolean)=>void; setMode:(m:Mode)=>void;
  equipment:Equipment[]; setEquipment:(v:Equipment[])=>void; resolved:boolean; waterFlow:number; waterWasted:number; simulationMinutes:number;
  electricWaste:number; waterLossCost:number; electricLossCost:number; totalLoss:number; simulatedWeek:any[];
  resolveProblem:()=>void; startScenario:(mode:Mode)=>void; waterTariff:number; electricTariff:number; setWaterTariff:(n:number)=>void; setElectricTariff:(n:number)=>void; currency:string; setCurrency:(currency:string)=>void;
  mobileOpen:boolean; setMobileOpen:(v:boolean)=>void; onLogout:()=>void;
}

function Shell(props:ShellProps){
  const navigate=useNavigate()
  const [alertCount,setAlertCount]=useState(0)
  useReactEffect(()=>{let alive=true;const load=()=>api('/alerts').then((rows:any[])=>{if(alive)setAlertCount(rows.filter(row=>row.status!=='resolved').length)}).catch(()=>{});load();const timer=window.setInterval(load,3000);return()=>{alive=false;window.clearInterval(timer)}},[])
  const labels=props.lang==='ar'?{dashboard:'لوحة التحكم',water:'مراقبة المياه',electric:'مراقبة الكهرباء',equipment:'إدارة المعدات',alerts:'التنبيهات',analytics:'التحليلات والتقارير',recommendations:'التوصيات الذكية',simulation:'المحاكاة التجريبية',presentation:'عرض المشروع',settings:'الإعدادات'}:{dashboard:'Tableau de bord',water:'Suivi de l’eau',electric:'Suivi électrique',equipment:'Équipements',alerts:'Alertes',analytics:'Analyses et rapports',recommendations:'Recommandations',simulation:'Simulation',presentation:'Présentation',settings:'Paramètres'}
  const nav=[['dashboard',labels.dashboard,LayoutDashboard],['water',labels.water,Droplets],['electric',labels.electric,Zap],['equipment',labels.equipment,Settings],['alerts',labels.alerts,Bell],['analytics',labels.analytics,BarChart3],['recommendations',labels.recommendations,Lightbulb],['simulation',labels.simulation,Activity],['presentation',labels.presentation,Printer],['settings',labels.settings,Settings]] as const
  return <div className="dashboard-layout"><aside className={props.mobileOpen?'sidebar open':'sidebar'}><div className="sidebar-brand"><img className="sidebar-full-logo" src="/watflow-logo.png" alt="WatFlow"/><button className="close-menu" onClick={()=>props.setMobileOpen(false)}><X/></button></div>
    <nav>{nav.map(([path,label,Icon])=><NavLink key={path} to={`/app/${path}`} onClick={()=>props.setMobileOpen(false)}><Icon size={19}/><span>{label}</span></NavLink>)}</nav>
    <div className="sidebar-simulation"><span className="simulation-dot"/>بيانات محاكاة تجريبية</div></aside>
    <main className="main-area"><header className="topbar"><button className="menu-btn" aria-label={props.mobileOpen?'إغلاق القائمة':'فتح القائمة'} onClick={()=>props.setMobileOpen(!props.mobileOpen)}><Menu/></button><div className="top-actions"><span className="system-status"><span/>{props.lang==='ar'?'النظام يعمل':'Système actif'}</span><button className="language-toggle" aria-label={props.lang==='ar'?'Passer au français':'Changer en arabe'} onClick={props.toggleLang}><Languages size={18}/><b>{props.lang==='ar'?'FR':'AR'}</b></button><button className="icon-btn" aria-label={props.lang==='ar'?'فتح التنبيهات':'Ouvrir les alertes'} title={props.lang==='ar'?'التنبيهات':'Alertes'} onClick={()=>navigate('/app/alerts')}><Bell size={19}/><i>{alertCount}</i></button><button className="avatar" aria-label={props.lang==='ar'?'تسجيل الخروج':'Déconnexion'} title={props.lang==='ar'?'تسجيل الخروج':'Déconnexion'} onClick={props.onLogout}>م</button></div></header>
      <div className="page-content"><Routes>
        <Route path="dashboard" element={<Dashboard {...props}/>}/>
        <Route path="water" element={<ResourcePage {...props} resource="water"/>}/>
        <Route path="electric" element={<ResourcePage {...props} resource="electric"/>}/>
        <Route path="equipment" element={<EquipmentPage {...props}/>}/>
        <Route path="alerts" element={<AlertsPage {...props}/>}/>
        <Route path="analytics" element={<AnalyticsPage {...props}/>}/>
        <Route path="recommendations" element={<RecommendationsPage {...props}/>}/>
        <Route path="simulation" element={<SimulationPage {...props}/>}/>
        <Route path="presentation" element={<PresentationPage {...props}/>}/>
        <Route path="settings" element={<SettingsPage {...props}/>}/>
        <Route path="*" element={<Dashboard {...props}/>}/>
      </Routes></div></main></div>
}

function PageTitle({title,subtitle,action}:{title:string;subtitle:string;action?:React.ReactNode}){return <div className="page-title"><div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>}

function Dashboard(props:ShellProps){
  const [alerts,setAlerts]=useState<any[]>([])
  const [distributionResource,setDistributionResource]=useState<'water'|'electric'>('water')
  const [consumptionRows,setConsumptionRows]=useState<any[]>([])
  useReactEffect(()=>{let alive=true;const load=()=>api('/alerts').then((rows:any[])=>{if(alive)setAlerts(rows)}).catch(()=>{});load();const timer=window.setInterval(load,2000);return()=>{alive=false;window.clearInterval(timer)}},[])
  useReactEffect(()=>{let alive=true;api('/consumption').then((rows:any[])=>{if(alive)setConsumptionRows(rows)}).catch(()=>{});return()=>{alive=false}},[])
  const activeAlerts=alerts.filter(alert=>alert.status!=='resolved').length
  const latest=props.simulatedWeek.at(-1)||{water:0,electric:0}
  const exportSummary=()=>{const content=['المؤشر,القيمة','استهلاك الماء اليومي (m3),'+latest.water.toFixed(2),'استهلاك الكهرباء اليومي (kWh),'+latest.electric.toFixed(2),'الخسارة الحالية ('+props.currency+'),'+props.totalLoss.toFixed(2),'التنبيهات النشطة,'+activeAlerts].join('\n');const link=document.createElement('a');link.href=URL.createObjectURL(new Blob(['\uFEFF'+content],{type:'text/csv;charset=utf-8'}));link.download='dlww-summary.csv';link.click();URL.revokeObjectURL(link.href)}
  const distributionTotals=new Map<string,number>()
  consumptionRows.filter(row=>row.resource_type===distributionResource).forEach(row=>{const equipmentName=row.equipment_name||'معدات غير محددة';distributionTotals.set(equipmentName,(distributionTotals.get(equipmentName)||0)+Number(row.consumption_value||0))})
  const distributionTotal=Array.from(distributionTotals.values()).reduce((sum,value)=>sum+value,0)
  const distribution=Array.from(distributionTotals,([name,value])=>({name,value:distributionTotal?value/distributionTotal*100:0}))
  const distributionColors=['#0ea5e9','#14b8a6','#f59e0b','#6366f1']
  const cards=[
    {label:'استهلاك المياه',value:`${latest.water.toFixed(1)} m³`,sub:'اليوم · بيانات تجريبية',icon:Droplets,color:'blue',change:props.mode==='water'?'استهلاك مرتفع':'ضمن النطاق'},
    {label:'استهلاك الكهرباء',value:`${latest.electric.toFixed(1)} kWh`,sub:'اليوم · بيانات تجريبية',icon:Zap,color:'orange',change:props.mode==='electric'?'استهلاك مرتفع':'ضمن النطاق'},
    {label:'الخسائر المالية',value:`${props.totalLoss.toFixed(2)} ${props.currency}`,sub:'التقدير اليومي',icon:BarChart3,color:'red',change:'هدر محتمل'},
    {label:'حالة النظام',value:`${props.equipment.length} معدات`,sub:`${activeAlerts} تنبيهات نشطة`,icon:Activity,color:'green',change:'بيانات محاكاة'},
  ]
  return <><PageTitle title="لوحة التحكم" subtitle="نظرة عامة على استهلاك المؤسسة" action={<button className="btn outline" onClick={exportSummary}><Download size={17}/>تصدير الملخص</button>}/>
    <div className="kpi-grid">{cards.map(({label,value,sub,icon:Icon,color,change})=> <article className="kpi-card" key={label}><div className={`kpi-icon ${color}`}><Icon/></div><div className="kpi-main"><div><span>{label}</span><strong>{value}</strong></div><small>{sub}</small></div><em className={change.includes('+')?'bad':''}>{change}</em></article>)}</div>
    <div className="dashboard-grid"><article className="panel wide"><div className="panel-head"><div><h3>اتجاه الاستهلاك خلال 7 أيام</h3><p>بيانات محاكاة مترابطة</p></div><div className="legend"><span className="blue-dot"/>الماء <span className="orange-dot"/>الكهرباء</div></div><ResponsiveContainer width="100%" height={260}><AreaChart data={props.simulatedWeek}><defs><linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/><stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="day"/><YAxis/><Tooltip/><Area type="monotone" dataKey="water" stroke="#0ea5e9" fill="url(#water)" strokeWidth={3}/><Line type="monotone" dataKey="electric" stroke="#f59e0b" strokeWidth={2}/></AreaChart></ResponsiveContainer></article>
    <article className="panel"><div className="panel-head"><div><h3>توزيع الاستهلاك</h3><p>{distributionResource==='water'?'الماء · m³':'الكهرباء · kWh'} حسب المعدة</p></div><select className="distribution-select" aria-label="مورد الاستهلاك" value={distributionResource} onChange={event=>setDistributionResource(event.target.value as 'water'|'electric')}><option value="water">الماء</option><option value="electric">الكهرباء</option></select></div><div className="distribution-chart">{distribution.length?<><ResponsiveContainer width="100%" height={220}><PieChart><Pie data={distribution} cx="50%" cy="50%" innerRadius={52} outerRadius={82} dataKey="value" paddingAngle={3} stroke="#fff" strokeWidth={2}>{distribution.map((item,index)=><Cell key={item.name} fill={distributionColors[index%distributionColors.length]}/>)}</Pie><Tooltip formatter={(value:any)=>String(Number(value).toFixed(1))+'%'}/></PieChart></ResponsiveContainer><div className="pie-legend" dir="rtl">{distribution.map((item,index)=><span className="pie-legend-item" key={item.name}><i style={{backgroundColor:distributionColors[index%distributionColors.length]}}/><b>{item.name}</b></span>)}</div></>:<p className="empty-state">لا توجد قراءات محفوظة لهذا المورد بعد.</p>}</div></article></div>
    <div className="bottom-grid"><article className="panel"><div className="panel-head"><h3>النشاط الأخير</h3><button className="link-btn" onClick={()=>location.href='/app/alerts'}>عرض التنبيهات</button></div><div className="activity-list" dir="rtl">{[['تم تحديث قراءة المضخة','الآن','blue'],['تم اكتشاف استهلاك الليلة','منذ 18 دقيقة','orange'],['تمت مراجعة بيانات الري','منذ ساعتين','green']].map(([a,t,c])=> <div className={`activity activity-${c}`} key={a} dir="rtl"><span className={`activity-dot ${c}`} aria-hidden="true"/><div className="activity-copy"><strong>{a}</strong><small>{t}</small></div></div>)}</div></article><article className="panel"><div className="panel-head"><h3>تنبيهات مهمة</h3><span className="badge red">{activeAlerts} نشط</span></div><div className="alert-list">{alerts.filter(alert=>alert.status!=='resolved').slice(0,2).map(alert=><button key={alert.id} onClick={()=>location.href='/app/alerts'}><div className={`alert-icon ${alert.severity==='مرتفع'?'red':'orange'}`}><AlertTriangle/></div><div><strong>{alert.alert_type==='water_leak'?'احتمال وجود تسرب للمياه':'تشغيل مضخة خارج أوقات التشغيل'}</strong><small>{alert.severity} · {new Date(alert.created_at).toLocaleTimeString('ar-MA',{hour:'2-digit',minute:'2-digit'})}</small></div><ChevronLeft/></button>)}{activeAlerts===0&&<p className="empty-state">لا توجد تنبيهات نشطة حالياً.</p>}</div></article></div>
  </>
}

function ResourcePage(props:ShellProps & {resource:'water'|'electric'}){
  const water=props.resource==='water'; const normal=water?2:4.5; const current=water?props.waterFlow:props.mode==='electric'?7.2:4.5
  const hourly=water?(props.mode==='water'?[2,1.8,2.1,2,2.3,10,9.5,6.2,3.1,2,2.2,2]:[2,1.8,2.1,2,2.3,2,2.1,1.9,2,2.2,2.1,2]):(props.mode==='electric'?[3.8,3.5,3.6,4,4.2,7.2,6.8,5.5,4.7,4.3,4.1,4]:[3.8,3.5,3.6,4,4.2,4,4.1,3.9,4.2,4.3,4.1,4])
  const chartData=hourly.map((v,i)=>({hour:`${i}:00`,value:v}))
  const readings=props.simulatedWeek
  const daily=readings.at(-1)?.[water?'water':'electric']||0
  const weekly=readings.reduce((sum,row)=>sum+row[water?'water':'electric'],0)
  const monthly=weekly/Math.max(readings.length,1)*30
  const tariff=water?props.waterTariff:props.electricTariff
  return <><PageTitle title={water?'مراقبة المياه':'مراقبة الكهرباء'} subtitle={water?'تتبع التدفق والاستهلاك المائي':'متابعة الاستهلاك والطاقة الكهربائية'} action={<span className="simulation-chip">بيانات محاكاة Simulation</span>}/>
    <div className="kpi-grid three">{(water?[['الاستهلاك اليومي',`${daily.toFixed(1)} m³`,Droplets,'blue'],['الاستهلاك الشهري التقديري',`${monthly.toFixed(1)} m³`,Waves,'green'],['التكلفة التقديرية',`${(monthly*tariff).toFixed(2)} ${props.currency}`,BarChart3,'orange']]:[['الاستهلاك اليومي',`${daily.toFixed(1)} kWh`,Zap,'orange'],['الاستهلاك الشهري التقديري',`${monthly.toFixed(1)} kWh`,Bolt,'blue'],['التكلفة التقديرية',`${(monthly*tariff).toFixed(2)} ${props.currency}`,BarChart3,'red']]).map(([l,v,Icon,c]:any)=><article className="kpi-card" key={l}><div className={`kpi-icon ${c}`}><Icon/></div><div className="kpi-main"><div><span>{l}</span><strong>{v}</strong></div></div></article>)}</div>
    <div className="resource-grid"><article className="panel"><div className="panel-head"><h3>{water?'تدفق المياه حسب الساعة':'الاستطاعة الكهربائية حسب الساعة'}</h3></div><ResponsiveContainer width="100%" height={300}><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="hour"/><YAxis/><Tooltip/><Line type="monotone" dataKey="value" stroke={water?'#0ea5e9':'#f59e0b'} strokeWidth={3} dot={{r:3}}/></LineChart></ResponsiveContainer></article>
    <article className={`meter-card ${props.mode==='normal'?'normal':water?'danger':'warning'}`}><div className="meter-head"><span>العداد المباشر</span><b>{props.mode==='normal'?'طبيعي':'غير طبيعي'}</b></div><div className="gauge"><div className="gauge-ring" style={{'--value': `${Math.min((current/12)*100,100)}%`} as React.CSSProperties}><div><strong>{current}</strong><span>{water?'لتر/دقيقة':'kWh'}</span></div></div></div><div className="meter-details"><div><span>المعدل الطبيعي</span><strong>{normal} {water?'لتر/د':'kWh'}</strong></div><div><span>{water?'المدة غير الطبيعية':'الفائض'}</span><strong>{water?(props.mode==='water'?props.simulationMinutes:0)+' دقيقة':props.electricWaste+' kWh'}</strong></div></div></article></div>
    {((water&&props.mode==='water')||(!water&&props.mode==='electric'))&&<article className="warning-banner"><div className="warning-icon"><AlertTriangle/></div><div><h3>{water?'تحذير: تم اكتشاف احتمال وجود تسرب للمياه!':'تم اكتشاف تشغيل كهربائي غير طبيعي!'}</h3><p>{water?`تم رصد تدفق قدره 10 لترات/دقيقة لمدة ${props.simulationMinutes} دقيقة.`:'تعمل مضخة المياه خارج أوقات التشغيل المحددة.'}</p></div><div className="loss-box"><span>الهدر المقدر</span><strong>{water?props.waterWasted+' لتر':props.electricWaste.toFixed(2)+' kWh'}</strong><small>{water?props.waterLossCost.toFixed(2):props.electricLossCost.toFixed(2)} {props.currency}</small></div></article>}
  </>
}

function EquipmentPage(props:ShellProps){
  const [editing,setEditing]=useState<Equipment|null>(null)
  const [show,setShow]=useState(false)
  const [query,setQuery]=useState('')
  const [statusFilter,setStatusFilter]=useState('all')
  const visibleEquipment=props.equipment.filter(item=>(item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())||item.type.toLocaleLowerCase().includes(query.toLocaleLowerCase()))&&(statusFilter==='all'||item.status===statusFilter))
  const save=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();const fd=new FormData(e.currentTarget);const item={name:String(fd.get('name')),type:String(fd.get('type')),location:String(fd.get('location')),resource:String(fd.get('resource')),normal:Number(fd.get('normal')),threshold:Number(fd.get('threshold')),status:editing?.status||'normal'};try{const row=await api(editing?`/equipment/${editing.id}`:'/equipment',{method:editing?'PUT':'POST',body:JSON.stringify(item)});const saved=mapEquipment(row);props.setEquipment(editing?props.equipment.map(x=>x.id===saved.id?saved:x):[...props.equipment,saved]);setShow(false);setEditing(null)}catch{alert('تعذر حفظ المعدة. تأكد من تشغيل خادم البيانات.')}}
  const remove=async(id:number)=>{try{await api(`/equipment/${id}`,{method:'DELETE'});props.setEquipment(props.equipment.filter(x=>x.id!==id))}catch{alert('تعذر حذف المعدة. تأكد من تشغيل خادم البيانات.')}}
  return <><PageTitle title="إدارة المعدات" subtitle="إضافة ومتابعة أجهزة الاستهلاك في المؤسسة" action={<button className="btn primary" onClick={()=>{setEditing(null);setShow(true)}}><Plus size={18}/>إضافة معدة</button>}/>
    <div className="equipment-toolbar"><div className="search-box"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="البحث عن معدة..."/></div><select className="filter-btn" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">جميع الحالات</option><option value="normal">طبيعي</option><option value="warning">تحذير</option><option value="danger">خطر</option><option value="offline">غير متصل</option></select></div>
    <div className="equipment-table"><div className="table-head"><span>المعدة</span><span>الموقع</span><span>المورد</span><span>الاستهلاك الطبيعي</span><span>الحالة</span><span/></div>{visibleEquipment.map(item=><div className="table-row" key={item.id}><div className="equipment-name"><span className="equipment-icon"><Gauge/></span><div><strong>{item.name}</strong><small>{item.type}</small></div></div><span>{item.location}</span><span><b className={item.resource.includes('ماء')?'resource water':'resource electric'}>{item.resource}</b></span><span>{item.normal}</span><span><b className={`status-badge ${item.status}`}>{item.status==='normal'?'طبيعي':item.status==='warning'?'تحذير':item.status==='danger'?'خطر':'غير متصل'}</b></span><span className="row-actions"><button onClick={()=>{setEditing(item);setShow(true)}}>تعديل</button><button onClick={()=>remove(item.id)}><Trash2 size={16}/></button></span></div>)}</div>
    {show&&<div className="modal-backdrop"><form className="modal" onSubmit={save}><div className="modal-head"><h3>{editing?'تعديل المعدة':'إضافة معدة جديدة'}</h3><button type="button" onClick={()=>setShow(false)}><X/></button></div><div className="form-grid"><label>اسم المعدة<input name="name" defaultValue={editing?.name} required/></label><label>النوع<input name="type" defaultValue={editing?.type} required/></label><label>الموقع<input name="location" defaultValue={editing?.location} required/></label><label>المورد<select name="resource" defaultValue={editing?.resource||'ماء'}><option>ماء</option><option>كهرباء</option><option>كهرباء وماء</option></select></label><label>الاستهلاك الطبيعي<input name="normal" type="number" step="0.1" defaultValue={editing?.normal||0} required/></label><label>الحد الأقصى<input name="threshold" type="number" step="0.1" defaultValue={editing?.threshold||0} required/></label></div><button className="btn primary modal-submit">حفظ المعدة</button></form></div>}
  </>
}

function AlertsPage(props:ShellProps){
  const [filter,setFilter]=useState('all'); const [alerts,setAlerts]=useState<any[]>([])
  const refresh=()=>api('/alerts').then((rows:any[])=>setAlerts(rows.map(row=>({id:row.id,title:row.alert_type==='water_leak'?'احتمال وجود تسرب للمياه':'تشغيل مضخة خارج أوقات التشغيل',desc:row.description,equipment:row.equipment_name||'معدات المؤسسة',severity:row.severity,loss:Number(row.estimated_loss)||0,time:new Date(row.created_at).toLocaleString('ar-MA'),type:row.alert_type==='water_leak'?'water':'electric',status:row.status}))))
  useReactEffect(()=>{refresh().catch(()=>{})},[])
  const visible=alerts.filter(a=>filter==='all'||a.type===filter)
  const update=async(a:any)=>{const status=a.status==='resolved'?'active':'resolved';await api(`/alerts/${a.id}`,{method:'PATCH',body:JSON.stringify({status})});await refresh()}
  return <><PageTitle title="مركز التنبيهات" subtitle="سجل التنبيهات والاستهلاك غير الطبيعي" action={<button className="btn outline" onClick={()=>refresh().catch(()=>{})}>تحديث السجل</button>}/><div className="filter-tabs"><button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>الكل <span>{alerts.length}</span></button><button className={filter==='water'?'active':''} onClick={()=>setFilter('water')}>المياه</button><button className={filter==='electric'?'active':''} onClick={()=>setFilter('electric')}>الكهرباء</button></div><div className="alerts-page">{visible.map(a=><article className={a.status==='resolved'?'alert-card resolved':'alert-card'} key={a.id}><div className={`severity ${a.severity==='مرتفع'?'red':a.severity==='متوسط'?'orange':'blue'}`}><AlertTriangle/></div><div className="alert-content"><div className="alert-title"><h3>{a.title}</h3><span>{a.severity}</span></div><p>{a.desc}</p><div className="alert-meta"><b>{a.equipment}</b><span>{a.time}</span><span>الخسارة: {a.loss.toFixed(2)} {props.currency}</span></div></div><button className="btn outline" onClick={()=>update(a).catch(()=>{})}>{a.status==='resolved'?'إعادة الفتح':'تمت المعالجة'}</button></article>)}</div></>
}

function RecommendationsPage(props:ShellProps){
  const recs=props.mode==='water'?[{title:'فحص الأنابيب والصنابير',cause:`تدفق غير طبيعي مستمر منذ ${props.simulationMinutes} دقيقة.`,saving:props.waterLossCost,priority:'عالية',icon:Droplets,color:'blue'}]:props.mode==='electric'?[{title:'ضبط جدول تشغيل المضخة',cause:'المضخة تستهلك الكهرباء خارج وقت التشغيل المحدد.',saving:props.electricLossCost,priority:'عالية',icon:Zap,color:'orange'}]:[]
  return <><PageTitle title="التوصيات الذكية" subtitle="اقتراحات مبنية على قواعد تحليل الاستهلاك"/>{recs.length?<div className="recommendation-grid">{recs.map(r=><article className="recommendation-card" key={r.title}><div className="recommendation-top"><div className={`kpi-icon ${r.color}`}><r.icon/></div><span className="priority high">{r.priority}</span></div><h3>{r.title}</h3><div className="cause"><span>سبب ظهور التوصية</span><p>{r.cause}</p></div><div className="saving"><span>التوفير المالي المحتمل حتى الآن</span><strong>{r.saving.toFixed(2)} {props.currency}</strong></div><p>افحص المعدة المرتبطة بالتنبيه، ثم استخدم المحاكاة لتسجيل أثر الإصلاح.</p></article>)}</div>:<article className="panel"><h3>لا توجد توصيات عاجلة</h3><p>شغّل سيناريو تسرب المياه أو هدر الكهرباء لتوليد توصية مرتبطة بالقراءات.</p></article>}</>
}

function AnalyticsPage(props:ShellProps){
  const [realizedSavings,setRealizedSavings]=useState(0)
  const [period,setPeriod]=useState<'day'|'week'|'month'|'custom'>('week')
  const [startDate,setStartDate]=useState(()=>{const date=new Date();date.setDate(date.getDate()-6);return date.toISOString().slice(0,10)})
  const [endDate,setEndDate]=useState(()=>new Date().toISOString().slice(0,10))
  useReactEffect(()=>{api('/alerts').then((rows:any[])=>setRealizedSavings(rows.filter(row=>row.status==='resolved').reduce((sum,row)=>sum+(Number(row.estimated_loss)||0),0))).catch(()=>{})},[])
  const rows=period==='custom'?props.simulatedWeek.filter(row=>row.date&&row.date>=startDate&&row.date<=endDate):period==='day'?props.simulatedWeek.slice(-1):props.simulatedWeek.slice(-7)
  const count=Math.max(rows.length,1)
  const multiplier=period==='month'?30/count:1
  const waterTotal=rows.reduce((sum,row)=>sum+row.water,0)*multiplier
  const electricTotal=rows.reduce((sum,row)=>sum+row.electric,0)*multiplier
  const waterCost=waterTotal*props.waterTariff
  const electricCost=electricTotal*props.electricTariff
  const periodName=period==='day'?'يومي':period==='week'?'أسبوعي':period==='custom'?'مخصص':'شهري تقديري'
  const data=[{name:'قبل التدخل',water:waterTotal,electric:electricTotal},{name:'بعد التدخل',water:Math.max(0,waterTotal-props.waterWasted/1000),electric:Math.max(0,electricTotal-props.electricWaste)}]
  const exportCsv=()=>{const rowsCsv=['الفترة,الماء m3,الكهرباء kWh,تكلفة الماء,تكلفة الكهرباء,الهدر',`${periodName},${waterTotal.toFixed(2)},${electricTotal.toFixed(2)},${waterCost.toFixed(2)},${electricCost.toFixed(2)},${props.totalLoss.toFixed(2)}`];const blob=new Blob(['\uFEFF'+rowsCsv.join('\n')],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='dlww-report.csv';a.click();URL.revokeObjectURL(a.href)}
  return <><PageTitle title="التحليل المالي والتقارير" subtitle="ربط الاستهلاك بالخسائر والتوفير المحتمل" action={<div className="report-actions"><select value={period} onChange={e=>setPeriod(e.target.value as 'day'|'week'|'month'|'custom')}><option value="day">تقرير يومي</option><option value="week">تقرير أسبوعي</option><option value="month">تقرير شهري تقديري</option><option value="custom">فترة مخصصة</option></select>{period==='custom'&&<><input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/><input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></>}<button className="btn primary" onClick={exportCsv}><Download size={17}/>تحميل CSV</button><button className="btn outline" onClick={()=>window.print()}><Printer size={17}/>PDF / طباعة</button></div>}/>
    <div className="kpi-grid four"><article className="kpi-card"><span>تكلفة المياه للفترة ({periodName})</span><strong>{waterCost.toFixed(2)} {props.currency}</strong></article><article className="kpi-card"><span>تكلفة الكهرباء للفترة ({periodName})</span><strong>{electricCost.toFixed(2)} {props.currency}</strong></article><article className="kpi-card"><span>الخسائر اليومية الحالية</span><strong>{props.totalLoss.toFixed(2)} {props.currency}</strong></article><article className="kpi-card"><span>التوفير المحقق من التنبيهات المعالجة</span><strong>{realizedSavings.toFixed(2)} {props.currency}</strong></article></div>
    <div className="dashboard-grid"><article className="panel"><div className="panel-head"><h3>قبل التدخل مقابل بعد التدخل ({periodName})</h3></div><ResponsiveContainer width="100%" height={300}><BarChart data={data}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name"/><YAxis/><Tooltip/><Bar dataKey="water" fill="#0ea5e9" radius={[8,8,0,0]}/><Bar dataKey="electric" fill="#f59e0b" radius={[8,8,0,0]}/></BarChart></ResponsiveContainer></article><article className="panel financial-summary"><h3>ملخص الخسائر والتوفير</h3><div><span>الخسائر الشهرية التقديرية</span><strong>{(props.totalLoss*30).toFixed(2)} {props.currency}</strong></div><div><span>التوفير المحقق من التنبيهات المعالجة</span><strong className="green-text">{realizedSavings.toFixed(2)} {props.currency}</strong></div><div><span>التوفير السنوي المتوقع</span><strong className="green-text">{(props.totalLoss*365).toFixed(2)} {props.currency}</strong></div></article></div>
  </>
}

function SimulationPage(props:ShellProps){
  const [activeAlerts,setActiveAlerts]=useState(0)
  useReactEffect(()=>{let alive=true;const load=()=>api('/alerts').then((rows:any[])=>{if(alive)setActiveAlerts(rows.filter(row=>row.status!=='resolved').length)}).catch(()=>{});load();const timer=window.setInterval(load,2000);return()=>{alive=false;window.clearInterval(timer)}},[])
  const start=(mode:Mode)=>props.startScenario(mode)
  return <><PageTitle title="المحاكاة التجريبية للنظام" subtitle="عرض تفاعلي لحالات اكتشاف الهدر ومعالجته" action={<span className="simulation-chip">LIVE · بيانات محاكاة</span>}/>
    <div className="simulation-status" dir="rtl"><div className="simulation-state"><span className={props.running?'live-dot active':'live-dot'}/><div><small>حالة المحاكاة</small><strong>{props.mode==='normal'?'تشغيل طبيعي':props.mode==='water'?'تم اكتشاف تسرب للمياه':'تم اكتشاف هدر الكهرباء'}</strong></div></div><div className="simulation-controls"><button className="control secondary" onClick={()=>props.setRunning(!props.running)}>{props.running?'إيقاف مؤقت':'بدء المحاكاة'}</button><button className="control" onClick={()=>props.startScenario('normal')}>إعادة ضبط</button></div></div>
    <div className="scenario-grid" dir="rtl"><button className={props.mode==='water'?'scenario active-water':'scenario'} onClick={()=>start('water')}><div className="scenario-icon blue"><Droplets/></div><div><h3>تسرب المياه</h3><p>ارتفاع التدفق من 2 إلى 10 لتر/دقيقة</p></div><span>تشغيل السيناريو</span></button><button className={props.mode==='electric'?'scenario active-electric':'scenario'} onClick={()=>start('electric')}><div className="scenario-icon orange"><Zap/></div><div><h3>هدر الكهرباء</h3><p>تشغيل المضخة خارج أوقات العمل</p></div><span>تشغيل السيناريو</span></button><button className={props.mode==='normal'?'scenario active-normal':'scenario'} onClick={()=>start('normal')}><div className="scenario-icon green"><ShieldCheck/></div><div><h3>التشغيل الطبيعي</h3><p>جميع المعدات ضمن المعدلات العادية</p></div><span>عرض الحالة</span></button></div>
    <div className="simulation-workspace" dir="rtl"><article className="panel simulation-result-panel"><div className="panel-head"><h3>النتيجة المباشرة</h3><span className="badge blue">محاكاة</span></div>{props.mode==='normal'?<div className="normal-result"><div className="success-ring"><ShieldCheck/></div><h3>النظام يعمل بشكل طبيعي</h3><p>لم يتم تسجيل أي استهلاك غير عادي.</p></div>:props.mode==='water'?<div className="leak-result"><div className="result-metrics" dir="rtl"><div className="result-metric"><span>التدفق الحالي</span><strong><bdi dir="ltr">10</bdi><small>لتر/دقيقة</small></strong></div><div className="result-metric"><span>المياه المهدورة</span><strong><bdi dir="ltr">{props.waterWasted}</bdi><small>لتر</small></strong></div><div className="result-metric"><span>الخسارة التقديرية</span><strong><bdi dir="ltr">{props.waterLossCost.toFixed(2)} {props.currency}</bdi></strong></div></div><div className="proposed-action" dir="rtl"><div className="proposed-icon"><Lightbulb/></div><div><strong>الإجراء المقترح</strong><p>فحص الأنابيب والصنابير وإغلاق مصدر التسرب.</p></div></div><button className="btn primary action-button" onClick={props.resolveProblem}>محاكاة التدخل والإصلاح</button></div>:<div className="leak-result"><div className="result-metrics" dir="rtl"><div className="result-metric"><span>الاستهلاك الحالي</span><strong><bdi dir="ltr">7.2 kWh</bdi></strong></div><div className="result-metric"><span>الطاقة الإضافية</span><strong><bdi dir="ltr">{props.electricWaste.toFixed(2)} kWh</bdi></strong></div><div className="result-metric"><span>الخسارة التقديرية</span><strong><bdi dir="ltr">{props.electricLossCost.toFixed(2)} {props.currency}</bdi></strong></div></div><div className="proposed-action" dir="rtl"><div className="proposed-icon"><Lightbulb/></div><div><strong>الإجراء المقترح</strong><p>ضبط جدول التشغيل وإيقاف المضخة خارج الساعات المحددة.</p></div></div><button className="btn primary action-button" onClick={props.resolveProblem}>تطبيق التحسين التجريبي</button></div>}</article><article className="panel simulation-process-panel"><div className="panel-head"><h3>خط البيانات الموحد</h3></div><div className="flow-steps simulation-flow" dir="rtl"><div className="flow-step"><Gauge/><span>القياس</span></div><div className="flow-step"><Activity/><span>التحليل</span></div><div className="flow-step"><AlertTriangle/><span>اكتشاف الخلل</span></div><div className="flow-step"><Bell/><span>التنبيه</span></div><div className="flow-step"><Waves/><span>التدخل</span></div></div><div className="simulation-linked" dir="rtl"><div className="linked-reading"><span className="blue-dot"/><span>قراءات الماء</span><strong><bdi dir="ltr">{props.mode==='water'?10:2} ل/د</bdi></strong></div><div className="linked-reading"><span className="orange-dot"/><span>قراءات الكهرباء</span><strong><bdi dir="ltr">{props.mode==='electric'?7.2:4.5} kWh</bdi></strong></div><div className="linked-reading"><span className="green-dot"/><span>تنبيهات نشطة</span><strong><bdi dir="ltr">{activeAlerts}</bdi></strong></div></div></article></div>
  </>
}

function PresentationPage(props:ShellProps){
  return <main className="presentation-view"><PageTitle title="عرض المشروع " subtitle="نموذج أولي برمجي يعتمد على بيانات محاكاة، ولا يتصل حالياً بحساسات حقيقية." action={<span className="simulation-chip">وضع العرض · بيانات تجريبية</span>}/>
    <div className="dashboard-grid"><article className="panel"><span className="eyebrow">المشكلة</span><h2>الهدر يظهر غالباً بعد وصول الفاتورة</h2><p>التدفق غير الطبيعي أو تشغيل المعدات خارج الجدول قد يرفع مصاريف الأنشطة الصغيرة.</p></article><article className="panel"><span className="eyebrow">الحل</span><h2>قياس، اكتشاف، تنبيه، ثم توفير</h2><p>يعرض النموذج قراءة الاستهلاك ويقارنها بالحدود، ثم يقدر الخسارة ويقترح إجراءً.</p></article></div>
    <article className="panel presentation-flow"><h2>كيف يعمل النظام</h2><div className="flow-steps"><span><Gauge/>قياس الاستهلاك</span><ChevronLeft/><span><Activity/>تحليل البيانات</span><ChevronLeft/><span><AlertTriangle/>اكتشاف الخلل</span><ChevronLeft/><span><Bell/>إرسال التنبيه</span><ChevronLeft/><span><Waves/>التدخل والتوفير</span></div></article>
    <div className="scenario-grid"><button className="scenario" onClick={()=>props.startScenario('water')}><div className="scenario-icon blue"><Droplets/></div><div><h3>اعرض اكتشاف تسرب</h3><p>تدفق محاكى: 2 إلى 10 لترات في الدقيقة.</p></div><span>بدء العرض</span></button><button className="scenario" onClick={()=>props.startScenario('electric')}><div className="scenario-icon orange"><Zap/></div><div><h3>اعرض هدر الكهرباء</h3><p>استهلاك محاكى لمضخة خارج وقت العمل.</p></div><span>بدء العرض</span></button><button className="scenario" onClick={props.resolveProblem}><div className="scenario-icon green"><ShieldCheck/></div><div><h3>اعرض نتيجة الإصلاح</h3><p>إغلاق التنبيه وتسجيل أثر التدخل.</p></div><span>تطبيق الإجراء</span></button></div>
    <div className="presentation-note"><strong>المرحلة الحالية:</strong> نموذج أولي بقراءات محاكاة. الربط المستقبلي المقترح: ESP32، حساس التدفق، وحدات قياس الكهرباء، وواجهة API أو MQTT.</div>
  </main>
}

function SettingsPage(props:ShellProps){
  const [saved,setSaved]=useState(false)
  const [settingsId,setSettingsId]=useState<number|null>(null)
  const [businessInfo,setBusinessInfo]=useState({business_name:'',business_type:'',city:'',address:''})
  const [thresholds,setThresholds]=useState({water:10,electricity:50})
  const [preferences,setPreferences]=useState({work_start:'08:00',work_end:'18:00',notifications_enabled:true,currency:'DH',language:props.lang})
  useReactEffect(()=>{api('/settings').then((row:any)=>{setSettingsId(row.id);props.setWaterTariff(row.water_tariff);props.setElectricTariff(row.electricity_tariff);props.setCurrency(row.currency||'DH');setThresholds({water:row.water_threshold,electricity:row.electricity_threshold});setPreferences({work_start:row.work_start||'08:00',work_end:row.work_end||'18:00',notifications_enabled:Boolean(row.notifications_enabled),currency:row.currency||'DH',language:row.language||props.lang})}).catch(()=>{});api('/business').then((row:any)=>setBusinessInfo({business_name:row.business_name,business_type:row.business_type,city:row.city,address:row.address})).catch(()=>{})},[])
  const save=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();const fd=new FormData(e.currentTarget);try{await Promise.all([api('/business',{method:'PUT',body:JSON.stringify({business_name:fd.get('business_name'),business_type:fd.get('business_type'),city:fd.get('city'),address:fd.get('address')})}),settingsId&&api('/settings',{method:'PUT',body:JSON.stringify({id:settingsId,water_tariff:props.waterTariff,electricity_tariff:props.electricTariff,water_threshold:Number(fd.get('water_threshold')),electricity_threshold:Number(fd.get('electricity_threshold')),language:preferences.language,work_start:preferences.work_start,work_end:preferences.work_end,notifications_enabled:preferences.notifications_enabled,currency:preferences.currency})})]);props.setCurrency(preferences.currency);if(preferences.language!==props.lang)props.toggleLang();window.dispatchEvent(new Event('dlww-business-updated'));setSaved(true)}catch{setSaved(false);alert('تعذر حفظ الإعدادات. تأكد من تشغيل خادم البيانات.')}}
  return <><PageTitle title="الإعدادات" subtitle="تخصيص بيانات المؤسسة والتعريفات والحدود"/><form className="settings-form" onSubmit={save}><section className="settings-section"><h3>بيانات المؤسسة</h3><div className="form-grid"><label>اسم المؤسسة<input name="business_name" value={businessInfo.business_name} onChange={e=>setBusinessInfo({...businessInfo,business_name:e.target.value})}/></label><label>نوع النشاط<select name="business_type" value={businessInfo.business_type} onChange={e=>setBusinessInfo({...businessInfo,business_type:e.target.value})}><option>تعاونية فلاحية</option><option>مغسلة</option><option>ورشات حرفية</option><option>محل تجاري</option></select></label><label>المدينة<select name="city" value={businessInfo.city} onChange={e=>setBusinessInfo({...businessInfo,city:e.target.value})}><option>العيون</option><option>الدار البيضاء</option><option>الرباط</option><option>أكادير</option><option>مراكش</option><option>فاس</option><option>طنجة</option><option>الداخلة</option><option>كلميم</option><option>وجدة</option><option>سطات</option><option>بني ملال</option><option>مكناس</option><option>الصويرة</option></select></label><label>العنوان<input name="address" value={businessInfo.address} onChange={e=>setBusinessInfo({...businessInfo,address:e.target.value})}/></label></div></section><section className="settings-section"><h3>التعريفات والحدود</h3><div className="form-grid"><label>سعر الماء (DH/m³)<input type="number" step="0.01" value={props.waterTariff} onChange={e=>props.setWaterTariff(Number(e.target.value))}/></label><label>سعر الكهرباء (DH/kWh)<input type="number" step="0.01" value={props.electricTariff} onChange={e=>props.setElectricTariff(Number(e.target.value))}/></label><label>الحد الطبيعي للماء<input name="water_threshold" type="number" value={thresholds.water} onChange={e=>setThresholds({...thresholds,water:Number(e.target.value)})}/></label><label>الحد الطبيعي للكهرباء<input name="electricity_threshold" type="number" value={thresholds.electricity} onChange={e=>setThresholds({...thresholds,electricity:Number(e.target.value)})}/></label><label>بداية الدوام<input type="time" value={preferences.work_start} onChange={e=>setPreferences({...preferences,work_start:e.target.value})}/></label><label>نهاية الدوام<input type="time" value={preferences.work_end} onChange={e=>setPreferences({...preferences,work_end:e.target.value})}/></label><label>اللغة<select value={preferences.language} onChange={e=>setPreferences({...preferences,language:e.target.value as Lang})}><option value="ar">العربية</option><option value="fr">Français</option></select></label><label>العملة<select value={preferences.currency} onChange={e=>setPreferences({...preferences,currency:e.target.value})}><option value="DH">DH</option><option value="EUR">EUR</option></select></label><label>الإشعارات<input type="checkbox" checked={preferences.notifications_enabled} onChange={e=>setPreferences({...preferences,notifications_enabled:e.target.checked})}/></label></div></section><div className="settings-footer"><span>{saved?'تم حفظ الإعدادات بنجاح':'يتم حفظ التغييرات في قاعدة البيانات'}</span><button className="btn primary">حفظ الإعدادات</button></div></form></>
}

export default App





















