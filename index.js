require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();

// ================= MIDDLEWARE =================
app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://shop-jewellers-client.web.app",
    "https://shop-jewellers-client.firebaseapp.com"
  ],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  credentials: true,
}));
app.use(express.json());
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500
}));

// ================= SAFE NUMBER CONVERTER =================
const safe = (v) => (isNaN(Number(v)) ? 0 : Number(v));

// ================= MONGO DB CONNECTION =================
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rd6jhgv.mongodb.net/?appName=Cluster0`;
let client;
let db;
let collections = {}; // গ্লোবাল অবজেক্ট হিসেবে কালেকশনগুলো রাখার জন্য

async function connectDB() {
  if (db) return collections;
  try {
    client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });
    await client.connect();
    db = client.db("shopDb");

    // কালেকশনগুলো একবারেই এখানে ডিক্লেয়ার করা হলো
    collections.productsCollection = db.collection("products");
    collections.usersCollection = db.collection("users");
    collections.cartsCollection = db.collection("carts");
    collections.salesCollection = db.collection("sales");
    collections.expensesCollection = db.collection("expenses");
    collections.receivablesCollection = db.collection("receivables");
    collections.transactionsCollection = db.collection("transactions");
    collections.cashListCollection = db.collection("cashs");
    collections.staffCollection = db.collection("staffs");
    collections.profitsCollection = db.collection("profits");
    collections.reportsCollection = db.collection("reports");

    console.log("💎 MongoDB Connected successfully!");
    return collections;
  } catch (error) {
    console.error("DB Initial Connection Error:", error);
    process.exit(1); // কানেকশন না হলে সার্ভার বন্ধ করে দেবে
  }
}

// প্রতি রিকোয়েস্টে কালেকশনগুলো রিকোয়েস্ট অবজেক্টে পাস করার মিডলওয়্যার
app.use((req, res, next) => {
  req.collections = collections;
  next();
});

// ================= VERIFY TOKEN =================
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) return res.status(403).send({ message: "Forbidden access" });
    req.decoded = decoded;
    next();
  });
};

// ================= VERIFY ADMIN =================
const verifyAdmin = async (req, res, next) => {
  try {
    const { usersCollection } = req.collections;
    if (!req.decoded?.email) return res.status(401).send({ message: "Unauthorized access" });
    const user = await usersCollection.findOne({ email: req.decoded.email });
    if (!user || user.role !== "admin") return res.status(403).send({ message: "Forbidden access" });
    next();
  } catch (error) {
    res.status(500).send({ message: "Internal Server Error" });
  }
};

// Base Route
app.get("/", (req, res) => {
  res.send({ message: "Jewellers Shop Server is running flawlessly 🚀" });
});

// ================= JWT AUTHENTICATION =================
app.post("/jwt", async (req, res) => {
  try {
    const user = req.body;
    if (!user?.email) return res.status(400).send({ message: "Email required" });

    // সিকিউরিটি ফিক্স: টোকেন দেওয়ার আগে ইউজার আসলেই ডাটাবেজে আছে কিনা তা চেক করা ভালো
    const exist = await req.collections.usersCollection.findOne({ email: user.email });
    if (!exist) return res.status(404).send({ message: "User not found" });

    const token = jwt.sign({ email: user.email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "7d" });
    res.send({ token });
  } catch (error) {
    res.status(500).send({ message: "JWT generation failed", error: error.message });
  }
});

// ================= USERS API =================
app.post("/users", async (req, res) => {
  const { usersCollection } = req.collections;
  const exist = await usersCollection.findOne({ email: req.body.email });
  if (exist) return res.send({ message: "user already exists", insertedId: null });
  const user = { ...req.body, role: "user", createdAt: new Date() };
  res.send(await usersCollection.insertOne(user));
});

app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
  res.send(await req.collections.usersCollection.find().toArray());
});

app.get("/users/admin/:email", verifyToken, async (req, res) => {
  const email = req.params.email;
  if (email !== req.decoded.email) return res.status(403).send({ message: "Forbidden access" });
  const user = await req.collections.usersCollection.findOne({ email });
  res.send({ admin: user?.role === "admin" });
});

app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).send({ message: "Invalid ID" });
  res.send(await req.collections.usersCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { role: 'admin' } }));
});

app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).send({ message: "Invalid ID" });
  res.send(await req.collections.usersCollection.deleteOne({ _id: new ObjectId(req.params.id) }));
});

// ================= CARTS API =================
app.get("/carts", verifyToken, async (req, res) => {
  if (req.query.email !== req.decoded.email) return res.status(403).send({ message: "forbidden access" });
  res.send(await req.collections.cartsCollection.find({ email: req.query.email }).toArray());
});

app.post("/carts", verifyToken, async (req, res) => {
  if (req.body.email !== req.decoded.email) return res.status(403).send({ message: "forbidden access" });
  res.send(await req.collections.cartsCollection.insertOne(req.body));
});

app.delete("/carts/:id", verifyToken, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).send({ message: "Invalid ID" });
  const cart = await req.collections.cartsCollection.findOne({ _id: new ObjectId(req.params.id) });
  if (!cart) return res.status(404).send({ message: "Cart not found" });
  if (cart.email !== req.decoded.email) return res.status(403).send({ message: "Forbidden access" });
  res.send(await req.collections.cartsCollection.deleteOne({ _id: new ObjectId(req.params.id) }));
});

// ================= PRODUCTS API =================
app.post("/products", verifyToken, verifyAdmin, async (req, res) => {
  const p = req.body;
  const product = {
    name: p.name, karat: p.karat, image: p.image,
    buyPrice: safe(p.buyPrice), sellPrice: safe(p.sellPrice), stock: safe(p.stock),
    vori: safe(p.vori), ana: safe(p.ana), rati: safe(p.rati), point: safe(p.point),
    createdAt: new Date()
  };
  res.send(await req.collections.productsCollection.insertOne(product));
});

app.get("/products", async (req, res) => {
  res.send(await req.collections.productsCollection.find().sort({ createdAt: -1 }).toArray());
});

app.get('/products/:id', async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).send({ message: "Invalid ID" });
  const product = await req.collections.productsCollection.findOne({ _id: new ObjectId(req.params.id) });
  if (!product) return res.status(404).send({ message: "Product not found" });
  res.send(product);
});

app.patch('/products/:id', verifyToken, verifyAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).send({ success: false, message: "Invalid ID" });
  try {
    const existingProduct = await req.collections.productsCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!existingProduct) return res.status(404).send({ success: false, message: "Product not found" });

    const updated = {
      name: req.body.name || existingProduct.name,
      karat: req.body.karat || existingProduct.karat,
      image: req.body.image || existingProduct.image,
      buyPrice: req.body.buyPrice !== undefined ? safe(req.body.buyPrice) : existingProduct.buyPrice,
      sellPrice: req.body.sellPrice !== undefined ? safe(req.body.sellPrice) : existingProduct.sellPrice,
      vori: req.body.vori !== undefined ? safe(req.body.vori) : existingProduct.vori,
      ana: req.body.ana !== undefined ? safe(req.body.ana) : existingProduct.ana,
      rati: req.body.rati !== undefined ? safe(req.body.rati) : existingProduct.rati,
      point: req.body.point !== undefined ? safe(req.body.point) : existingProduct.point,
      stock: req.body.stock !== undefined ? safe(req.body.stock) : existingProduct.stock,
      updatedAt: new Date()
    };

    const result = await req.collections.productsCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: updated });
    res.send({ success: true, message: result.modifiedCount ? "Product updated successfully" : "No changes detected" });
  } catch (error) {
    res.status(500).send({ success: false, message: "Update failed", error: error.message });
  }
});

app.delete("/products/:id", verifyToken, verifyAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).send({ success: false, message: "Invalid ID" });
  await req.collections.productsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
  res.send({ success: true, message: "Product deleted successfully" });
});

// ================= SALES API =================
app.post("/sales", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { productId, quantity, sellPrice } = req.body;
    if (!productId || !quantity || !sellPrice) return res.status(400).send({ success: false, message: 'Missing fields' });

    const product = await req.collections.productsCollection.findOne({ _id: new ObjectId(productId) });
    if (!product) return res.status(404).send({ success: false, message: "Product not found" });

    const qty = safe(quantity);
    const price = safe(sellPrice);

    if (qty <= 0) return res.status(400).send({ success: false, message: "Invalid quantity" });
    if (safe(product.stock) < qty) return res.status(400).send({ success: false, message: "Not enough stock" });

    const revenue = price * qty;
    const cost = safe(product.buyPrice) * qty;
    const profit = revenue - cost;

    const saleDoc = {
      productId: product._id.toString(),
      productName: product.name,
      image: product.image || "",
      quantity: qty,
      sellPrice: price,
      buyPrice: safe(product.buyPrice),
      revenue, cost, profit,
      createdAt: new Date()
    };

    const saleResult = await req.collections.salesCollection.insertOne(saleDoc);
    await req.collections.productsCollection.updateOne({ _id: new ObjectId(productId) }, { $inc: { stock: -qty } });

    res.send({ success: true, message: "Sale completed", insertedId: saleResult.insertedId });
  } catch (err) {
    res.status(500).send({ success: false, message: err.message });
  }
});

app.get("/sales", verifyToken, verifyAdmin, async (req, res) => {
  res.send(await req.collections.salesCollection.find().toArray());
});

app.delete("/sales/:id", verifyToken, verifyAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).send({ message: "Invalid ID" });
  try {
    const sale = await req.collections.salesCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!sale) return res.status(404).send({ success: false, message: "Sale not found" });

    if (ObjectId.isValid(sale.productId)) {
      await req.collections.productsCollection.updateOne({ _id: new ObjectId(sale.productId) }, { $inc: { stock: sale.quantity } });
    }
    await req.collections.salesCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.send({ success: true });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

// ================= PROFITS API =================
app.post("/profits", verifyToken, verifyAdmin, async (req, res) => {
  const data = { note: req.body.note || "", amount: safe(req.body.amount), createdAt: new Date() };
  const result = await req.collections.profitsCollection.insertOne(data);
  res.send({ success: true, insertedId: result.insertedId });
});

app.get("/profits", verifyToken, verifyAdmin, async (req, res) => {
  res.send(await req.collections.profitsCollection.find().toArray());
});

app.patch("/profits/:id", verifyToken, verifyAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).send({ message: "Invalid ID" });
  const result = await req.collections.profitsCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { note: req.body.note, amount: safe(req.body.amount) } });
  res.send({ success: result.modifiedCount > 0 });
});

app.delete("/profits/:id", verifyToken, verifyAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).send({ message: "Invalid ID" });
  try {
    const result = await req.collections.profitsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.send({ success: result.deletedCount > 0 });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

// ================= STAFF API =================
app.post("/staffs", verifyToken, verifyAdmin, async (req, res) => {
  const staffData = { ...req.body };
  delete staffData._id;
  res.status(201).send(await req.collections.staffCollection.insertOne(staffData));
});

app.get("/staffs", verifyToken, verifyAdmin, async (req, res) => {
  res.send(await req.collections.staffCollection.find().toArray());
});

app.get("/staffs/:id", verifyToken, verifyAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).send({ message: "Invalid ID" });
  const staff = await req.collections.staffCollection.findOne({ _id: new ObjectId(req.params.id) });
  if (!staff) return res.status(404).send({ message: "Staff not found" });
  res.send(staff);
});

app.put("/staffs/:id", verifyToken, verifyAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).send({ message: "Invalid ID" });
  const { _id, ...updateData } = req.body;
  res.send(await req.collections.staffCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: updateData }));
});

app.patch("/staffs/:id", verifyToken, verifyAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).send({ message: "Invalid ID" });
  const { _id, ...patchData } = req.body;
  res.send(await req.collections.staffCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: patchData }));
});

app.delete("/staffs/:id", verifyToken, verifyAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).send({ message: "Invalid ID" });
  res.send(await req.collections.staffCollection.deleteOne({ _id: new ObjectId(req.params.id) }));
});

// ================= EXPENSES API =================
app.post("/expenses", verifyToken, verifyAdmin, async (req, res) => {
  res.send(await req.collections.expensesCollection.insertOne({ ...req.body, amount: safe(req.body.amount), createdAt: new Date() }));
});

app.get("/expenses", verifyToken, verifyAdmin, async (req, res) => {
  res.send(await req.collections.expensesCollection.find().sort({ createdAt: -1 }).toArray());
});

app.patch("/expenses/:id", verifyToken, verifyAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).send({ message: "Invalid ID" });
  res.send(await req.collections.expensesCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { title: req.body.title, amount: safe(req.body.amount) } }));
});

app.delete("/expenses/:id", verifyToken, verifyAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).send({ message: "Invalid ID" });
  res.send(await req.collections.expensesCollection.deleteOne({ _id: new ObjectId(req.params.id) }));
});

// ================= RECEIVABLE API =================
app.post("/receivables", verifyToken, verifyAdmin, async (req, res) => {
  const data = { name: req.body.name, amount: safe(req.body.amount), createdAt: req.body.date ? new Date(req.body.date) : new Date(), updatedAt: null };
  const result = await req.collections.receivablesCollection.insertOne(data);
  res.send({ success: true, insertedId: result.insertedId });
});

app.get("/receivables", verifyToken, verifyAdmin, async (req, res) => {
  res.send(await req.collections.receivablesCollection.find().sort({ createdAt: -1 }).toArray());
});

app.patch("/receivables/:id", verifyToken, verifyAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).send({ message: "Invalid ID" });
  const updatedData = { name: req.body.name, amount: safe(req.body.amount), updatedAt: new Date() };
  if (req.body.date) {
    updatedData.createdAt = new Date(req.body.date);
  }
  await req.collections.receivablesCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: updatedData });
  res.send({ success: true });
});

app.delete("/receivables/:id", verifyToken, verifyAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).send({ message: "Invalid ID Format" });
  try {
    const result = await req.collections.receivablesCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).send({ success: false, message: "Record not found" });
    res.send({ success: true, message: "Receivable record deleted successfully" });
  } catch (error) {
    res.status(500).send({ success: false, message: "Delete failed", error: error.message });
  }
});

// ================= TRANSACTIONS API =================
app.get("/transactions", verifyToken, verifyAdmin, async (req, res) => {
  try {
    res.send(await req.collections.transactionsCollection.find().sort({ createdAt: -1 }).toArray());
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch transactions" });
  }
});

app.post("/transactions", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { name, amount, createdAt, type } = req.body;
    const payload = { name, amount: safe(amount), type: type || (safe(amount) >= 0 ? "plus" : "minus"), createdAt: createdAt ? new Date(createdAt) : new Date() };
    res.send(await req.collections.transactionsCollection.insertOne(payload));
  } catch (error) {
    res.status(500).send({ message: "Failed to insert transaction" });
  }
});

app.patch("/transactions/:id", verifyToken, verifyAdmin, async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid ID Format" });
  try {
    const { name, amount, date, type } = req.body;
    const updateDoc = {
      $set: { name, amount: safe(amount), type: type || (safe(amount) >= 0 ? "plus" : "minus"), ...(date && { createdAt: new Date(date) }) }
    };
    res.send(await req.collections.transactionsCollection.updateOne({ _id: new ObjectId(id) }, updateDoc));
  } catch (error) {
    res.status(500).send({ message: "Failed to update transaction" });
  }
});

app.delete("/transactions/:id", verifyToken, verifyAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).send({ message: "Invalid ID Format" });
  try {
    res.send(await req.collections.transactionsCollection.deleteOne({ _id: new ObjectId(req.params.id) }));
  } catch (error) {
    res.status(500).send({ message: "Failed to delete transaction" });
  }
});

// ================= CASH LIST API =================
app.post("/cash-list", verifyToken, verifyAdmin, async (req, res) => {
  const now = new Date();
  const data = { title: req.body.title, amount: safe(req.body.amount), createdAt: now, date: now.toLocaleDateString("en-GB"), time: now.toLocaleTimeString("en-GB") };
  res.send(await req.collections.cashListCollection.insertOne(data));
});

app.get("/cash-list", verifyToken, verifyAdmin, async (req, res) => {
  res.send(await req.collections.cashListCollection.find().sort({ createdAt: -1 }).toArray());
});

app.patch("/cash-list/:id", verifyToken, verifyAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).send({ message: "Invalid ID" });
  res.send(await req.collections.cashListCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { title: req.body.title, amount: safe(req.body.amount) } }));
});

app.delete("/cash-list/:id", verifyToken, verifyAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).send({ message: "Invalid ID" });
  res.send(await req.collections.cashListCollection.deleteOne({ _id: new ObjectId(req.params.id) }));
});

app.get("/cash-total", verifyToken, verifyAdmin, async (req, res) => {
  const cash = await req.collections.cashListCollection.find().toArray();
  res.send({ total: cash.reduce((sum, c) => sum + safe(c.amount), 0) });
});

// ================= ANALYTICS & REPORTS =================
app.get("/admin-stats", verifyToken, verifyAdmin, async (req, res) => {
  res.send(await req.collections.salesCollection.aggregate([{ $group: { _id: "$productName", quantity: { $sum: "$quantity" }, revenue: { $sum: "$revenue" } } }]).toArray());
});

app.get("/analytics/daily", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const sales = await req.collections.salesCollection.find().toArray();
    const days = {};
    sales.forEach(s => {
      if (!s.createdAt) return;
      const date = new Date(s.createdAt).toISOString().split("T")[0];
      if (!days[date]) days[date] = { date, totalSales: 0, profit: 0, count: 0 };
      days[date].totalSales += safe(s.revenue);
      days[date].profit += safe(s.profit);
      days[date].count += 1;
    });
    res.send(Object.values(days));
  } catch (err) {
    res.status(500).send({ message: "Analytics failed" });
  }
});

app.post("/report/monthly/save", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const sales = await req.collections.salesCollection.find().toArray();
    const expenses = await req.collections.expensesCollection.find().toArray();
    const monthly = {};
    sales.forEach((s) => {
      if (!s.createdAt) return;
      const date = new Date(s.createdAt);
      const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
      if (!monthly[key]) monthly[key] = { month: key, revenue: 0, expense: 0 };
      monthly[key].revenue += safe(s.revenue);
    });
    expenses.forEach((e) => {
      if (!e.createdAt) return;
      const date = new Date(e.createdAt);
      const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
      if (!monthly[key]) monthly[key] = { month: key, revenue: 0, expense: 0 };
      monthly[key].expense += safe(e.amount);
    });
    const finalData = Object.values(monthly).map(({ month, revenue, expense }) => ({ month, revenue, expense }));
    await req.collections.reportsCollection.deleteMany({});
    if (finalData.length > 0) await req.collections.reportsCollection.insertMany(finalData);
    res.send({ success: true, message: "Monthly report saved", data: finalData });
  } catch (error) {
    res.status(500).send({ message: "Save failed" });
  }
});

app.get("/report/monthly", verifyToken, verifyAdmin, async (req, res) => {
  res.send(await req.collections.reportsCollection.find().sort({ month: 1 }).toArray());
});

// ================= COMPLETE ADVANCED DASHBOARD =================
app.get("/dashboard", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const salesData = await req.collections.salesCollection.find().toArray();
    const expenses = await req.collections.expensesCollection.find().toArray();
    const staff = await req.collections.staffCollection.find().toArray();
    const receivables = await req.collections.receivablesCollection.find().toArray();
    const cashList = await req.collections.cashListCollection.find().toArray();
    const transactions = await req.collections.transactionsCollection.find().toArray();
    const profitsData = await req.collections.profitsCollection.find().toArray();
    const products = await req.collections.productsCollection.find().toArray();

    const totalSales = salesData.reduce((sum, s) => sum + safe(s.revenue), 0);
    const totalCashFromList = cashList.reduce((sum, c) => sum + safe(c.amount), 0);
    const totalProfitsCollection = profitsData.reduce((sum, p) => sum + safe(p.amount), 0);

    let totalTransactionPlus = 0;
    transactions.forEach((t) => {
      if (t?.type === "plus" || (!t.type && safe(t.amount) > 0)) totalTransactionPlus += Math.abs(safe(t.amount));
    });

    let totalReceivablesPlus = 0;
    receivables.forEach((r) => {
      if (safe(r.amount) > 0) totalReceivablesPlus += safe(r.amount);
    });

    const totalExpense = expenses.reduce((sum, e) => sum + safe(e.amount), 0);
    const totalStaffSalary = staff.reduce((sum, st) => sum + safe(st.monthlySalary || st.salary), 0);

    let totalTransactionMinus = 0;
    transactions.forEach((t) => {
      if (t?.type === "minus" || (!t.type && safe(t.amount) < 0)) totalTransactionMinus += Math.abs(safe(t.amount));
    });

    let totalReceivablesMinus = 0;
    receivables.forEach((r) => {
      if (safe(r.amount) < 0) totalReceivablesMinus += Math.abs(safe(r.amount));
    });

    const totalStock = products.reduce((sum, p) => sum + safe(p.stock), 0);
    const totalStockValue = products.reduce((sum, p) => sum + (safe(p.stock) * safe(p.buyPrice)), 0);

    const allPlus = totalSales + totalCashFromList + totalProfitsCollection + totalTransactionPlus + totalReceivablesPlus;
    const allMinus = totalExpense + totalStaffSalary + totalTransactionMinus + totalReceivablesMinus;
    const totalCash = allPlus - allMinus;

    res.send({
      totalSales, totalCashFromList, totalProfitsCollection, totalTransactionPlus, totalReceivablesPlus,
      totalExpense, totalStaffSalary, totalTransactionMinus, totalReceivablesMinus, totalStock, totalStockValue, totalCash
    });
  } catch (error) {
    res.status(500).send({ success: false, message: "Dashboard data fetch failed" });
  }
});

// ================= GLOBAL LISTEN =================
const port = process.env.PORT || 5000;

// ডেটাবেজ সফলভাবে কানেক্ট হলেই কেবল অ্যাপ রানিং হবে
connectDB().then(() => {
  app.listen(port, () => {
    console.log(` Server running on port ${port}`);
  });
});

module.exports = app;