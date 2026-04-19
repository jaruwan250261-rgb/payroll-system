const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcrypt"); // 1. ดึง bcrypt มาใช้
const saltRounds = 10;
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(express.static("public"));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// --- API สำหรับพนักงาน (พร้อม Validation) ---
app.post("/save-employee", async (req, res) => {
    const { emp_id, fullname, bank_name, bank_account, id_card, address } = req.body;
    
    // 2. Validation: เช็คข้อมูลสำคัญห้ามว่าง
    if (!emp_id || !fullname || !bank_account) {
        return res.status(400).json({ error: "กรุณากรอกข้อมูลพนักงานให้ครบถ้วน" });
    }

    const { data, error } = await supabase
        .from("employees")
        .upsert({ emp_id, fullname, bank_name, bank_account, id_card, address });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: "บันทึกข้อมูลพนักงานสำเร็จ" });
});

// --- API บันทึกงานรายวัน (พร้อม Strict Validation) ---
app.post("/add-daily-record", async (req, res) => {
    const { date, emp_id, branch, work_days, daily_rate, commission, deduct_absent, deduct_uniform } = req.body;

    // 3. Strict Validation: ป้องกันค่าติดลบหรือค่าที่ผิดปกติ
    if (work_days <= 0 || daily_rate < 0) {
        return res.status(400).json({ error: "จำนวนวันทำงานหรือเรทค่าจ้างไม่ถูกต้อง" });
    }
    if (commission < 0 || deduct_absent < 0 || deduct_uniform < 0) {
        return res.status(400).json({ error: "ค่าคอมมิชชั่นหรือยอดหักห้ามติดลบ" });
    }

    const total_income = (work_days * daily_rate) + commission - deduct_absent - deduct_uniform;

    const { data, error } = await supabase.from("daily_records").insert({
        date, emp_id, branch, work_days, daily_rate, commission,
        deduct_absent, deduct_uniform, total_income
    });

    if (error) return res.status(500).json({ error: "ไม่สามารถบันทึกข้อมูลได้ (อาจไม่พบรหัสพนักงาน)" });
    res.json({ message: "บันทึกงานรายวันสำเร็จ" });
});

// --- API Login (แบบ Bcrypt) ---
app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    const { data: user, error } = await supabase
        .from("users")
        .select("*")
        .eq("username", username)
        .single();

    if (error || !user) return res.status(401).json({ success: false, message: "ไม่พบผู้ใช้งาน" });

    // 4. ตรวจสอบรหัสผ่านที่เข้ารหัสไว้
    const match = await bcrypt.compare(password, user.password);
    if (match) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: "รหัสผ่านไม่ถูกต้อง" });
    }
});

// --- API สำหรับลงทะเบียน Admin ใหม่ (ต้องใช้ bcrypt ก่อนเก็บ) ---
// คุณเฟรมสามารถใช้ Route นี้เพื่อสร้างรหัสผ่านที่ปลอดภัยครั้งแรก
app.post("/create-admin", async (req, res) => {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    const { data, error } = await supabase
        .from("users")
        .insert({ username, password: hashedPassword });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: "สร้างบัญชี Admin สำเร็จ" });
});

// ดึงข้อมูลสรุปแบบ Raw (รายรายการ)
app.get("/raw-records", async (req, res) => {
    const { start_date, end_date, branch } = req.query;
    let query = supabase.from("daily_records").select(`*, employees(fullname, bank_account, bank_name, id_card, address)`).gte("date", start_date).lte("date", end_date);
    if (branch !== "all") query = query.eq("branch", branch);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    const formatted = data.map(r => ({
        ...r,
        fullname: r.employees?.fullname,
        bank_account: r.employees?.bank_account,
        bank_name: r.employees?.bank_name,
        id_card: r.employees?.id_card,
        address: r.employees?.address
    }));
    res.json(formatted);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));