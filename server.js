require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const helmet = require('helmet');
const path = require('path');
const bcrypt = require('bcrypt'); // ✅ เพิ่ม bcrypt
const saltRounds = 10; // ✅ ตั้งค่าความปลอดภัย
const app = express();

// --- 1. Security & Middleware ---
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(express.json());
app.use(express.static('public'));

// เชื่อมต่อ Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// --- 2. Authentication System (สมัคร & ล็อกอิน) ---

// ✅ เพิ่ม Route สำหรับสมัครสมาชิก (Register) เพื่อสร้างรหัสแบบ Hash
app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบ" });

    // 🔒 เข้ารหัสรหัสผ่านก่อนบันทึก
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const { data, error } = await supabase
      .from('users')
      .insert([{ username, password: hashedPassword }]);

    if (error) throw error;
    res.json({ success: true, message: "สร้างบัญชีเรียบร้อยแล้ว" });
  } catch (err) {
    res.status(500).json({ success: false, message: "อาจมีชื่อผู้ใช้นี้แล้ว หรือเซิร์ฟเวอร์ขัดข้อง" });
  }
});

// 🔑 แก้ไข Login System ให้ใช้ bcrypt เทียบรหัส
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // 🔍 1. หา user จากชื่อก่อน
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    if (error || !user) {
      return res.status(401).json({ success: false, message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
    }

    // 🔒 2. เทียบรหัสที่กรอก กับรหัสที่ถูก Hash ใน DB
    const isMatch = await bcrypt.compare(password, user.password);

    if (isMatch) {
      res.json({ success: true, user: { username: user.username } });
    } else {
      res.status(401).json({ success: false, message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์" });
  }
});

// --- 3. Employee Management ---
app.get("/list-employees", async (req, res) => {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .order('emp_id', { ascending: true });
  res.json(data || []);
});

app.post("/save-employee", async (req, res) => {
  const { error } = await supabase.from('employees').upsert([req.body]);
  if (error) return res.status(500).send(error.message);
  res.send("บันทึกสำเร็จ");
});

app.delete("/delete-employee/:emp_id", async (req, res) => {
  const { error } = await supabase.from('employees').delete().eq('emp_id', req.params.emp_id);
  if (error) return res.status(500).send("ลบไม่สำเร็จ (อาจมีบันทึกงานค้างอยู่)");
  res.send("ลบเรียบร้อย");
});

app.get("/get-employee/:id", async (req, res) => {
  const { data, error } = await supabase.from('employees').select('fullname').eq('emp_id', req.params.id).single();
  res.json({ found: !!data, fullname: data ? data.fullname : "" });
});

// --- 4. Daily Records & Logic ---
app.post("/add-daily-record", async (req, res) => {
  try {
    const { emp_id, date, work_days, daily_rate, commission, deduct_absent, deduct_uniform } = req.body;

    if (!emp_id || !date) return res.status(400).send("กรุณากรอกรหัสพนักงานและวันที่");

    const total_income = (Number(work_days) * Number(daily_rate)) + Number(commission);
    const total_deduct = Number(deduct_absent) + Number(deduct_uniform);
    const tax = total_income * 0.03;
    const net_income = total_income - total_deduct - tax;

    const { error } = await supabase.from('daily_records').insert([{
      ...req.body,
      total_income,
      total_deduct,
      tax,
      net_income
    }]);

    if (error) throw error;
    res.send("บันทึกงานรายวันสำเร็จ");
  } catch (err) {
    res.status(500).send("เกิดข้อผิดพลาด: " + err.message);
  }
});

app.get("/records-by-date/:date", async (req, res) => {
  const { data, error } = await supabase
    .from('daily_records')
    .select(`*, employees(fullname)`)
    .eq('date', req.params.date);
  
  const result = data ? data.map(r => ({
    ...r,
    fullname: r.employees ? r.employees.fullname : "ไม่ทราบชื่อ"
  })) : [];
  res.json(result);
});

app.delete("/delete-record/:id", async (req, res) => {
  await supabase.from('daily_records').delete().eq('id', req.params.id);
  res.send("ลบแล้ว");
});

// --- 5. Summary Report ---
app.get("/weekly-summary", async (req, res) => {
  const { start_date, end_date, branch } = req.query;
  let query = supabase
    .from('daily_records')
    .select(`*, employees(*)`)
    .gte('date', start_date)
    .lte('date', end_date);

  if (branch !== 'all') query = query.eq('branch', branch);

  const { data, error } = await query;
  if (error) return res.status(500).json([]);

  const summary = {};
  data.forEach(r => {
    const id = r.emp_id;
    if (!summary[id]) {
      summary[id] = {
        emp_id: id,
        fullname: r.employees?.fullname || "ไม่ทราบชื่อ",
        bank_name: r.employees?.bank_name || "-",
        bank_account: r.employees?.bank_account || "-",
        id_card: r.employees?.id_card || "-",
        address: r.employees?.address || "-",
        total_days: 0, daily_rate: r.daily_rate, total_comm: 0,
        deduct_absent: 0, deduct_uniform: 0, total_income: 0, tax: 0, net_income: 0
      };
    }
    summary[id].total_days += r.work_days;
    summary[id].total_comm += r.commission;
    summary[id].deduct_absent += r.deduct_absent;
    summary[id].deduct_uniform += r.deduct_uniform