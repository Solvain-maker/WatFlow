import express from 'express'
import cors from 'cors'
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const app = express()
const db = new Database('dlww.db')
const JWT_SECRET = 'demo-only-secret-change-in-production'

app.use(cors())
app.use(express.json())

db.exec(`
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT UNIQUE, password_hash TEXT, role TEXT);
CREATE TABLE IF NOT EXISTS businesses (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, business_name TEXT, business_type TEXT, city TEXT, address TEXT);
CREATE TABLE IF NOT EXISTS equipment (id INTEGER PRIMARY KEY AUTOINCREMENT, business_id INTEGER, name TEXT, category TEXT, resource_type TEXT, location TEXT, normal_consumption REAL, threshold REAL, operating_hours TEXT, status TEXT);
CREATE TABLE IF NOT EXISTS consumption (id INTEGER PRIMARY KEY AUTOINCREMENT, equipment_id INTEGER, resource_type TEXT, consumption_value REAL, measurement_unit TEXT, timestamp TEXT, simulation_flag INTEGER);
CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, business_id INTEGER, equipment_id INTEGER, alert_type TEXT, severity TEXT, description TEXT, estimated_loss REAL, status TEXT, created_at TEXT, resolved_at TEXT);
CREATE TABLE IF NOT EXISTS recommendations (id INTEGER PRIMARY KEY AUTOINCREMENT, alert_id INTEGER, description TEXT, suggested_action TEXT, estimated_savings REAL, priority TEXT);
CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY AUTOINCREMENT, business_id INTEGER, water_tariff REAL, electricity_tariff REAL, water_threshold REAL, electricity_threshold REAL, language TEXT);
`)

const settingsColumns = new Set(db.prepare('PRAGMA table_info(settings)').all().map(column=>column.name))
if (!settingsColumns.has('work_start')) db.exec("ALTER TABLE settings ADD COLUMN work_start TEXT NOT NULL DEFAULT '08:00'")
if (!settingsColumns.has('work_end')) db.exec("ALTER TABLE settings ADD COLUMN work_end TEXT NOT NULL DEFAULT '18:00'")
if (!settingsColumns.has('notifications_enabled')) db.exec('ALTER TABLE settings ADD COLUMN notifications_enabled INTEGER NOT NULL DEFAULT 1')
if (!settingsColumns.has('currency')) db.exec("ALTER TABLE settings ADD COLUMN currency TEXT NOT NULL DEFAULT 'DH'")

const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count
if (!userCount) {
  const hash = bcrypt.hashSync('Demo123!', 10)
  const user = db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)').run('مدير التعاونية','demo@dlww.ma',hash,'admin')
  const business = db.prepare('INSERT INTO businesses (user_id,business_name,business_type,city,address) VALUES (?,?,?,?,?)').run(user.lastInsertRowid,'تعاونية الأمل','تعاونية فلاحية','العيون','منطقة الاستقلال، العيون')
  const bid = business.lastInsertRowid
  const equip = db.prepare('INSERT INTO equipment (business_id,name,category,resource_type,location,normal_consumption,threshold,operating_hours,status) VALUES (?,?,?,?,?,?,?,?,?)')
  const equipmentSeed = [
    ['مضخة المياه الرئيسية','مضخة','ماء وكهرباء','غرفة المضخات',4.5,7.2,'08:00-22:00','normal'],
    ['نظام الري','ري','ماء','المزرعة',12,18,'06:00-12:00','normal'],
    ['خزان المياه','خزان','ماء','الساحة',70,85,'مراقبة مستمرة','warning'],
    ['إنارة الورشة','إضاءة','كهرباء','ورشة العمل',2.1,3.5,'18:00-23:00','normal'],
    ['المعدات الفلاحية','معدات','كهرباء','المحطة الزراعية',6.4,9,'08:00-18:00','normal']
  ]
  equipmentSeed.forEach(row => equip.run(bid,row[0],row[1],row[2],row[3],row[4],row[5],row[6],row[7]))
  db.prepare('INSERT INTO settings (business_id,water_tariff,electricity_tariff,water_threshold,electricity_threshold,language) VALUES (?,?,?,?,?,?)').run(bid,8.5,1.6,10,50,'ar')
}

// Keep a linked seven-day sample series available for the demo on first run.
if (db.prepare('SELECT COUNT(*) AS count FROM consumption').get().count === 0) {
  const equipmentRows = db.prepare('SELECT id,name,resource_type FROM equipment').all()
  const insertReading = db.prepare('INSERT INTO consumption (equipment_id,resource_type,consumption_value,measurement_unit,timestamp,simulation_flag) VALUES (?,?,?,?,?,1)')
  const seedReadings = db.transaction(() => {
    for (let day = 6; day >= 0; day--) {
      const date = new Date(); date.setDate(date.getDate() - day)
      for (const item of equipmentRows) {
        const water = item.resource_type.includes('ماء')
        const electric = item.resource_type.includes('كهرباء')
        const abnormal = day === 2 && (item.name.includes('مضخة') || item.name.includes('ري'))
        const stamp = new Date(date); stamp.setHours(12, 0, 0, 0)
        if (water) insertReading.run(item.id, 'water', abnormal ? 11.2 : 8.1 + ((day * 7 + item.id) % 15) / 10, 'm3', stamp.toISOString())
        if (electric) insertReading.run(item.id, 'electric', abnormal ? 52 : 41 + ((day * 5 + item.id) % 12), 'kWh', stamp.toISOString())
      }
    }
  })
  seedReadings()
}

if (db.prepare('SELECT COUNT(*) AS count FROM alerts').get().count === 0) {
  const pump = db.prepare("SELECT id FROM equipment WHERE name LIKE '%مضخة%' LIMIT 1").get()
  const business = db.prepare('SELECT id FROM businesses LIMIT 1').get()
  if (pump && business) {
    const addAlert = db.prepare('INSERT INTO alerts (business_id,equipment_id,alert_type,severity,description,estimated_loss,status,created_at) VALUES (?,?,?,?,?,?,?,?)')
    addAlert.run(business.id,pump.id,'water_leak','مرتفع','تدفق ليلي أعلى من المعدل الطبيعي في بيانات المحاكاة.',2.04,'active',new Date(Date.now()-45*60000).toISOString())
    addAlert.run(business.id,pump.id,'electric_waste','متوسط','استهلاك كهربائي مرصود خارج ساعات العمل في بيانات المحاكاة.',4.32,'active',new Date(Date.now()-90*60000).toISOString())
  }
}

app.post('/api/auth/login', (req,res) => {
  const {email,password}=req.body
  const user=db.prepare('SELECT * FROM users WHERE email=?').get(email)
  if (!user || !bcrypt.compareSync(password,user.password_hash)) return res.status(401).json({message:'بيانات الدخول غير صحيحة'})
  const token=jwt.sign({id:user.id,email:user.email,role:user.role},JWT_SECRET,{expiresIn:'8h'})
  res.json({token,user:{id:user.id,name:user.name,email:user.email,role:user.role}})
})
app.post('/api/auth/register', (req,res) => {
  const {name,email,password,business_name,business_type,city}=req.body
  if (!name?.trim() || !email?.trim() || !password || password.length < 8) return res.status(400).json({message:'أدخل الاسم والبريد وكلمة مرور من 8 أحرف على الأقل'})
  try {
    const createAccount=db.transaction(()=>{
      const hash=bcrypt.hashSync(password,10)
      const user=db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)').run(name.trim(),email.trim().toLowerCase(),hash,'admin')
      const business=db.prepare('INSERT INTO businesses (user_id,business_name,business_type,city,address) VALUES (?,?,?,?,?)').run(user.lastInsertRowid,business_name?.trim()||name.trim(),business_type?.trim()||'نشاط مهني',city?.trim()||'','')
      db.prepare('INSERT INTO settings (business_id,water_tariff,electricity_tariff,water_threshold,electricity_threshold,language) VALUES (?,?,?,?,?,?)').run(business.lastInsertRowid,8.5,1.6,10,50,'ar')
      const addEquipment=db.prepare('INSERT INTO equipment (business_id,name,category,resource_type,location,normal_consumption,threshold,operating_hours,status) VALUES (?,?,?,?,?,?,?,?,?)')
      addEquipment.run(business.lastInsertRowid,'مضخة المياه الرئيسية','مضخة','ماء وكهرباء','غرفة المضخات',4.5,7.2,'08:00-22:00','normal')
      addEquipment.run(business.lastInsertRowid,'نظام الري','ري','ماء','المزرعة',12,18,'06:00-12:00','normal')
      addEquipment.run(business.lastInsertRowid,'خزان المياه','خزان','ماء','الساحة',70,85,'مراقبة مستمرة','normal')
      return {id:user.lastInsertRowid,name:name.trim(),email:email.trim().toLowerCase(),role:'admin'}
    })
    const user=createAccount()
    const token=jwt.sign({id:user.id,email:user.email,role:user.role},JWT_SECRET,{expiresIn:'8h'})
    res.status(201).json({token,user})
  } catch (error) {
    if (String(error).includes('UNIQUE')) return res.status(409).json({message:'البريد الإلكتروني مستخدم بالفعل'})
    res.status(500).json({message:'تعذر إنشاء الحساب'})
  }
})

app.use('/api', (req,res,next) => {
  if (req.path === '/auth/login') return next()
  const token = req.headers.authorization?.replace(/^Bearer\s+/i,'')
  if (!token) return res.status(401).json({message:'يلزم تسجيل الدخول'})
  try { req.user = jwt.verify(token,JWT_SECRET); next() }
  catch { res.status(401).json({message:'جلسة الدخول غير صالحة'}) }
})
const businessFor = userId => db.prepare('SELECT id FROM businesses WHERE user_id=?').get(userId)

app.get('/api/business', (req,res) => {
  const business=db.prepare('SELECT b.*,u.name AS owner_name FROM businesses b JOIN users u ON u.id=b.user_id WHERE b.user_id=?').get(req.user.id)
  res.json(business)
})
app.put('/api/business', (req,res) => {
  const {business_name,business_type,city,address}=req.body
  const business=businessFor(req.user.id)
  if (!business) return res.status(404).json({message:'المؤسسة غير موجودة'})
  db.prepare('UPDATE businesses SET business_name=?,business_type=?,city=?,address=? WHERE id=?').run(business_name,business_type,city,address,business.id)
  res.json(db.prepare('SELECT * FROM businesses WHERE id=?').get(business.id))
})
app.get('/api/equipment', (req,res) => { const business=businessFor(req.user.id); res.json(business?db.prepare('SELECT * FROM equipment WHERE business_id=?').all(business.id):[]) })
app.post('/api/equipment', (req,res) => {
  const b=businessFor(req.user.id)
  if (!b) return res.status(404).json({message:'المؤسسة غير موجودة'})
  const i=db.prepare('INSERT INTO equipment (business_id,name,category,resource_type,location,normal_consumption,threshold,operating_hours,status) VALUES (?,?,?,?,?,?,?,?,?)').run(b.id,req.body.name,req.body.category||req.body.type||'معدات',req.body.resource_type||req.body.resource||'ماء',req.body.location,req.body.normal_consumption||req.body.normal||0,req.body.threshold||0,req.body.operating_hours||'08:00-18:00',req.body.status||'normal')
  res.status(201).json(db.prepare('SELECT * FROM equipment WHERE id=?').get(i.lastInsertRowid))
})
app.put('/api/equipment/:id', (req,res) => {
  const item = req.body
  const business=businessFor(req.user.id)
  db.prepare('UPDATE equipment SET name=?,category=?,resource_type=?,location=?,normal_consumption=?,threshold=?,operating_hours=?,status=? WHERE id=? AND business_id=?')
    .run(item.name,item.category||item.type,item.resource_type||item.resource,item.location,item.normal_consumption??item.normal,item.threshold,item.operating_hours||'08:00-18:00',item.status||'normal',req.params.id,business?.id)
  const updated = db.prepare('SELECT * FROM equipment WHERE id=? AND business_id=?').get(req.params.id,business?.id)
  if (!updated) return res.status(404).json({message:'المعدة غير موجودة'})
  res.json(updated)
})
app.delete('/api/equipment/:id', (req,res) => { const business=businessFor(req.user.id); db.prepare('DELETE FROM equipment WHERE id=? AND business_id=?').run(req.params.id,business?.id); res.status(204).end() })
app.get('/api/settings', (req,res) => { const business=businessFor(req.user.id); res.json(business?db.prepare('SELECT * FROM settings WHERE business_id=?').get(business.id):null) })
app.put('/api/settings', (req,res) => {
  const business=businessFor(req.user.id)
  db.prepare('UPDATE settings SET water_tariff=?,electricity_tariff=?,water_threshold=?,electricity_threshold=?,language=?,work_start=?,work_end=?,notifications_enabled=?,currency=? WHERE id=? AND business_id=?').run(req.body.water_tariff,req.body.electricity_tariff,req.body.water_threshold,req.body.electricity_threshold,req.body.language,req.body.work_start||'08:00',req.body.work_end||'18:00',req.body.notifications_enabled?1:0,req.body.currency||'DH',req.body.id,business?.id)
  res.json(db.prepare('SELECT * FROM settings WHERE id=? AND business_id=?').get(req.body.id,business?.id))
})
app.get('/api/alerts', (req,res) => { const business=businessFor(req.user.id); res.json(business?db.prepare('SELECT a.*,e.name AS equipment_name FROM alerts a LEFT JOIN equipment e ON e.id=a.equipment_id WHERE a.business_id=? ORDER BY a.created_at DESC').all(business.id):[]) })
app.post('/api/alerts', (req,res) => {
  const {equipment_id,alert_type,severity,description,estimated_loss}=req.body
  const business = businessFor(req.user.id)?.id
  if (!business || (equipment_id && !db.prepare('SELECT id FROM equipment WHERE id=? AND business_id=?').get(equipment_id,business))) return res.status(400).json({message:'المعدة أو المؤسسة غير صالحة'})
  const result=db.prepare('INSERT INTO alerts (business_id,equipment_id,alert_type,severity,description,estimated_loss,status,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(business,equipment_id||null,alert_type,severity,description,estimated_loss||0,'active',new Date().toISOString())
  res.status(201).json(db.prepare('SELECT * FROM alerts WHERE id=?').get(result.lastInsertRowid))
})
app.patch('/api/alerts/:id', (req,res) => {
  const status=req.body.status
  const business=businessFor(req.user.id)
  db.prepare('UPDATE alerts SET status=?,estimated_loss=COALESCE(?,estimated_loss),resolved_at=? WHERE id=? AND business_id=?').run(status,req.body.estimated_loss??null,status==='resolved'?new Date().toISOString():null,req.params.id,business?.id)
  const alert=db.prepare('SELECT * FROM alerts WHERE id=? AND business_id=?').get(req.params.id,business?.id)
  if (!alert) return res.status(404).json({message:'التنبيه غير موجود'})
  res.json(alert)
})
app.get('/api/consumption', (req,res) => { const business=businessFor(req.user.id); res.json(business?db.prepare('SELECT c.*,e.name AS equipment_name FROM consumption c JOIN equipment e ON e.id=c.equipment_id WHERE e.business_id=? ORDER BY c.timestamp').all(business.id):[]) })
app.post('/api/consumption', (req,res) => {
  const {equipment_id,resource_type,consumption_value,measurement_unit,simulation_flag=1}=req.body
  const business=businessFor(req.user.id)
  if (!business || !db.prepare('SELECT id FROM equipment WHERE id=? AND business_id=?').get(equipment_id,business.id)) return res.status(400).json({message:'المعدة غير صالحة'})
  const result=db.prepare('INSERT INTO consumption (equipment_id,resource_type,consumption_value,measurement_unit,timestamp,simulation_flag) VALUES (?,?,?,?,?,?)')
    .run(equipment_id,resource_type,consumption_value,measurement_unit,new Date().toISOString(),simulation_flag)
  res.status(201).json(db.prepare('SELECT * FROM consumption WHERE id=?').get(result.lastInsertRowid))
})

const port=process.env.PORT||3001
app.listen(port,()=>console.log(`DLWW simulation API listening on http://localhost:${port}`))

