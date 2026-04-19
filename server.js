const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcrypt"); 
const saltRounds = 10;
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(express.static("public"));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// --- 1. ดึงรายชื่อพนักงานทั้งหมด (ที่หายไป) ---
app.get("/list-employees", async (req, res) => {
    const { data, error } = await supabase
        .from("employees")
        .select("*")
        .order("emp_id", { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});

// --- 2. ดึงชื่อพนักงานรายบุคคล (ใช้ตอนกรอกรหัสแล้วเด้งชื่อ) ---
app.get("/get-employee/:id", async (req, res) => {
    const { data, error } = await supabase
        .from("employees")
        .select("fullname")
        .eq("emp_id", req.params.id)
        .single();

    if (error || !data) return res.json({ found: false });
    res.json({ found: true, fullname: data.fullname });
});

// --- 3. บันทึก/อัปเดต ข้อมูลพนักงาน ---
app.post("/save-employee", async (req, res) => {
    const { emp_id, fullname, bank_name, bank_account, id_card, address } = req.body;
    if (!emp_id || !fullname) return res.status(400).json({ error: "ข้อมูลไม่ครบ" });

    const { data, error } = await supabase
        .from("employees")
        .upsert({ emp_id, fullname, bank_name, bank_account, id_card, address });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: "สำเร็จ" });
});

// --- 4. ลบพนักงาน ---
app.delete("/delete-employee/:id", async (req, res) => {
    const { error } = await supabase.from("employees").delete().eq("emp_id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.send("ลบสำเร็จ");
});

// --- 5. บันทึกงานรายวัน (พร้อม Validation) ---
app.post("/add-daily-record", async (req, res) => {
    const { date, emp_id, branch, work_days, daily_rate, commission, deduct_absent, deduct_uniform } = req.body;

    if (work_days <= 0 || daily_rate < 0) return res.status(400).json({ error: "ข้อมูลตัวเลขไม่ถูกต้อง" });

    const total_income = (work_days * daily_rate) + commission - deduct_absent - deduct_uniform;

    const { data, error } = await supabase.from("daily_records").insert({
        date, emp_id, branch, work_days, daily_rate, commission,
        deduct_absent, deduct_uniform, total_income
    });

    if (error) return res.status(500).json({ error: "บันทึกไม่สำเร็จ" });
    res.json({ message: "สำเร็จ" });
});

// --- 6. ดึงข้อมูลบันทึกรายวันตามวันที่ (ที่หายไป) ---
app.get("/records-by-date/:date", async (req, res) => {
    const { data, error } = await supabase
        .from("daily_records")
        .select(`*, employees(fullname)`)
        .eq("date", req.params.date);

    if (error) return res.status(500).json({ error: error.message });
    
    const formatted = data.map(r => ({
        ...r,
        fullname: r.employees?.fullname,
        total_deduct: (r.deduct_absent || 0) + (r.deduct_uniform || 0)
    }));
    res.json(formatted);
});

// --- 7. ลบบันทึกรายวัน ---
app.delete("/delete-record/:id", async (req, res) => {
    const { error } = await supabase.from("daily_records").delete().eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.send("ลบสำเร็จ");
});

// --- 8. ดึงข้อมูลสรุป (Raw Records) ---
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

// --- 9. Login (Bcrypt) ---
app.post("/login", async (req, res) => {
    const { username, password } = req.body;
    const { data: user, error } = await supabase.from("users").select("*").eq("username", username).single();

    if (error || !user) return res.status(401).json({ success: false });

    const match = await bcrypt.compare(password, user.password);
    if (match) res.json({ success: true });
    else res.status(401).json({ success: false });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));