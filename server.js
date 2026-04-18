const express = require("express");
const cors = require("cors");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

// ⚠️ ใส่ข้อมูลจากหน้า Supabase Settings ของคุณตรงนี้
const SUPABASE_URL = "https://dvzshyculmhtursqhjis.supabase.co";
const SUPABASE_KEY = "sb_publishable_ld0kFn6gDYnPw0v_KXD05g_Cd2UrWWh";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. ค้นหาพนักงาน
app.get("/get-employee/:id", async (req, res) => {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('emp_id', req.params.id)
    .single();
  res.json(data ? { found: true, ...data } : { found: false });
});

// 2. บันทึกพนักงาน
app.post("/save-employee", async (req, res) => {
  const { error } = await supabase.from('employees').upsert(req.body);
  res.send(error ? "เกิดข้อผิดพลาด" : "✅ บันทึกพนักงานออนไลน์สำเร็จ");
});

// 3. บันทึกรายวัน
app.post("/add-daily-record", async (req, res) => {
  const { error } = await supabase.from('daily_records').insert(req.body);
  res.send(error ? "เกิดข้อผิดพลาด" : "✅ บันทึกรายวันออนไลน์สำเร็จ");
});

// 4. สรุปยอดเงิน (ดึงข้อมูลจาก Cloud)
app.get("/weekly-summary", async (req, res) => {
  const { start_date, end_date, branch } = req.query;
  let query = supabase.from('daily_records').select(`
    work_days, daily_rate, commission, deduct_absent, deduct_uniform,
    employees ( emp_id, fullname, bank_account, bank_name, id_card, address )
  `).gte('date', start_date).lte('date', end_date);

  if (branch && branch !== 'all') query = query.eq('branch', branch);

  const { data, error } = await query;
  
  // จัดกลุ่มข้อมูล (Group by Employee)
  const grouped = {};
  data.forEach(r => {
    const id = r.employees.emp_id;
    if (!grouped[id]) {
      grouped[id] = { ...r.employees, total_days: 0, total_comm: 0, d_absent: 0, d_uniform: 0, total_income: 0 };
    }
    grouped[id].total_days += r.work_days;
    grouped[id].daily_rate = r.daily_rate; // ใช้เรทล่าสุด
    grouped[id].total_comm += r.commission;
    grouped[id].d_absent += r.deduct_absent;
    grouped[id].d_uniform += r.deduct_uniform;
    grouped[id].total_income += (r.work_days * r.daily_rate) + r.commission;
  });

  const result = Object.values(grouped).map(r => {
    const net_before_tax = r.total_income - (r.d_absent + r.d_uniform);
    const tax = net_before_tax > 1000 ? r.total_income * 0.03 : 0;
    return { ...r, tax, net_income: net_before_tax - tax };
  });

  res.json(result);
});

// 5. ดึงข้อมูลรายวันมาโชว์
app.get("/records-by-date/:date", async (req, res) => {
  const { data } = await supabase
    .from('daily_records')
    .select('id, branch, position, work_days, daily_rate, note, employees(fullname, emp_id)')
    .eq('date', req.params.date);
  
  const formatted = data.map(r => ({
    id: r.id, branch: r.branch, position: r.position, work_days: r.work_days, daily_rate: r.daily_rate, note: r.note,
    emp_id: r.employees.emp_id, fullname: r.employees.fullname, total_deduct: 0 // ดึงยอดหักมาโชว์ได้ถ้าต้องการ
  }));
  res.json(formatted);
});

// 6. ลบข้อมูล
app.delete("/delete-record/:id", async (req, res) => {
  await supabase.from('daily_records').delete().eq('id', req.params.id);
  res.send("ลบข้อมูลสำเร็จ");
});
// เพิ่มส่วนนี้เข้าไปใน server.js เพื่อดึงรายชื่อพนักงานทั้งหมด
app.get("/list-employees", async (req, res) => {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    return res.status(500).json([]);
  }
  res.json(data);
});
app.listen(3000, () => console.log("🚀 Server Online connected to Supabase"));