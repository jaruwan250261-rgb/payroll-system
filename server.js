const express = require("express");
const session = require("express-session");
const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcrypt");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(express.static("public"));

app.use(session({
    secret: 'frame-payroll-secret-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const checkAuth = (req, res, next) => {
    if (req.session.user) next();
    else res.status(401).json({ error: "Unauthorized" });
};

app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;
    const { data: user, error } = await supabase.from("users").select("*").eq("username", username).single();
    if (error || !user) return res.status(401).json({ success: false });
    const match = await bcrypt.compare(password, user.password);
    if (match) {
        req.session.user = username;
        res.json({ success: true });
    } else res.status(401).json({ success: false });
});

app.post("/api/logout", (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get("/api/list-employees", checkAuth, async (req, res) => {
    const { data, error } = await supabase.from("employees").select("*").order("emp_id", { ascending: true });
    res.json(data || []);
});

app.get("/api/get-employee/:id", checkAuth, async (req, res) => {
    const { data, error } = await supabase.from("employees").select("fullname").eq("emp_id", req.params.id).single();
    if (error || !data) return res.json({ found: false });
    res.json({ found: true, fullname: data.fullname });
});

app.post("/api/save-employee", checkAuth, async (req, res) => {
    await supabase.from("employees").upsert(req.body);
    res.json({ message: "สำเร็จ" });
});

app.delete("/api/delete-employee/:id", checkAuth, async (req, res) => {
    await supabase.from("employees").delete().eq("emp_id", req.params.id);
    res.send("ลบสำเร็จ");
});

app.post("/api/add-daily-record", checkAuth, async (req, res) => {
    const { date, emp_id, branch, position, work_days, daily_rate, commission, deduct_absent, deduct_uniform } = req.body;
    const n_days = parseFloat(work_days) || 0;
    const n_rate = parseFloat(daily_rate) || 0;
    const n_comm = parseFloat(commission) || 0;
    const n_absent = parseFloat(deduct_absent) || 0;
    const n_uniform = parseFloat(deduct_uniform) || 0;
    const total_income = (n_days * n_rate) + n_comm - n_absent - n_uniform;
    const { data, error } = await supabase.from("daily_records").insert({
        date, emp_id, branch, position,
        work_days: n_days, daily_rate: n_rate, commission: n_comm,
        deduct_absent: n_absent, deduct_uniform: n_uniform, total_income
    });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: "สำเร็จ" });
});

app.get("/api/records-by-date/:date", checkAuth, async (req, res) => {
    const { data, error } = await supabase.from("daily_records").select(`*, employees(fullname)`).eq("date", req.params.date);
    if (error) return res.status(500).json({ error: error.message });
    const formatted = (data || []).map(r => ({ ...r, fullname: r.employees?.fullname }));
    res.json(formatted);
});

app.delete("/api/delete-record/:id", checkAuth, async (req, res) => {
    await supabase.from("daily_records").delete().eq("id", req.params.id);
    res.send("ลบสำเร็จ");
});

app.get("/api/raw-records", checkAuth, async (req, res) => {
    const { start_date, end_date, branch } = req.query;
    let query = supabase.from("daily_records").select(`*, employees(fullname, bank_account, bank_name, id_card, address)`).gte("date", start_date).lte("date", end_date);
    if (branch !== "all") query = query.eq("branch", branch);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    const formatted = data.map(r => ({ ...r, fullname: r.employees?.fullname, bank_account: r.employees?.bank_account, bank_name: r.employees?.bank_name, id_card: r.employees?.id_card, address: r.employees?.address }));
    res.json(formatted);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));