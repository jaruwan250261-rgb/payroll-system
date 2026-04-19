// --- API บันทึกงานรายวัน (เพิ่มช่อง position) ---
app.post("/api/add-daily-record", checkAuth, async (req, res) => {
    const { date, emp_id, branch, position, work_days, daily_rate, commission, deduct_absent, deduct_uniform } = req.body;

    if (work_days <= 0 || daily_rate < 0) return res.status(400).json({ error: "ข้อมูลตัวเลขไม่ถูกต้อง" });

    const total_income = (work_days * daily_rate) + commission - deduct_absent - deduct_uniform;

    const { data, error } = await supabase.from("daily_records").insert({
        date, emp_id, branch, position, work_days, daily_rate, commission,
        deduct_absent, deduct_uniform, total_income
    });

    if (error) {
        console.error("Insert Error:", error);
        return res.status(500).json({ error: "บันทึกไม่สำเร็จ" });
    }
    res.json({ message: "สำเร็จ" });
});

// --- API ดึงข้อมูลสรุปรายรายการ (ตรวจสอบความถูกต้อง) ---
app.get("/api/raw-records", checkAuth, async (req, res) => {
    const { start_date, end_date, branch } = req.query;
    let query = supabase.from("daily_records").select(`*, employees(fullname, bank_account, bank_name, id_card, address)`).gte("date", start_date).lte("date", end_date);
    
    if (branch && branch !== "all") query = query.eq("branch", branch);

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