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
    "https://shop-jewellers-client.web.app"
  ],
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
  credentials: true
}));
app.use(express.json());

// API Rate Limiter (সার্ভার সুরক্ষার জন্য)
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // ১৫ মিনিট
  max: 500 // সর্বোচ্চ ৫০০ রিকোয়েস্ট
}));

// ================= SAFE NUMBER CONVERTER =================
const safe = (v) => (isNaN(Number(v)) ? 0 : Number(v));

// ================= MONGO DB CONNECTION =================
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rd6jhgv.mongodb.net/?appName=Cluster0`;
let client;
let db;

async function connectDB() {
  if (db) return db; // Vercel Optimization
  client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });
  await client.connect();
  db = client.db("shopDb");
  console.log("💎 MongoDB Connected successfully!");
  return db;
}

app.use(async (req, res, next) => {
  try {
    const database = await connectDB();
    req.collections = {
      productsCollection: database.collection("products"),
      usersCollection: database.collection("users"),
      cartsCollection: database.collection("carts"),
      salesCollection: database.collection("sales"),
      expensesCollection: database.collection("expenses"),
      receivablesCollection: database.collection("receivables"),
      transactionsCollection: database.collection("transactions"),
      cashListCollection: database.collection("cashs"),
      staffCollection: database.collection("staffs"),
      profitsCollection: database.collection("profits"),
      reportsCollection: database.collection("reports")
    };
    next();
  } catch (error) {
    console.error("DB Connection Error:", error);
    res.status(500).send({ message: "Database connection failed" });
  }
});

// ================= VERIFY TOKEN =================
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).send({ message: "Invalid authorization format" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
};

// ================= VERIFY ADMIN =================
const verifyAdmin = async (req, res, next) => {
  const { usersCollection } = req.collections;
  const user = await usersCollection.findOne({ email: req.decoded.email });
  if (!user || user.role !== "admin") {
    return res.status(403).send({ message: "Forbidden access" });
  }
  next();
};

// ================= JWT AUTHENTICATION =================
app.post("/jwt", async (req, res) => {
  try {
    const user = req.body;
    if (!user?.email) {
      return res.status(400).send({ message: "Email required" });
    }

    // 🛠️ FIX ১: নতুন গুগল সাইন-ইন ইউজারদের যেন টোকেন ব্লক না করে, তাই ডাটাবেজ চেক শিথিল করা হয়েছে
    const token = jwt.sign(
      { email: user.email },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "7d" }
    );
    res.send({ token });
  } catch (error) {
    res.status(500).send({ message: "JWT generation failed", error: error.message });
  }
});

// ================= USERS API =================
app.post("/users", async (req, res) => {
  const { usersCollection } = req.collections;
  const exist = await usersCollection.findOne({ email: req.body.email });
  if (exist) {
    return res.send({ message: "user already exists", insertedId: null });
  }
  const user = { ...req.body, role: "user", createdAt: new Date() };
  const result = await usersCollection.insertOne(user);
  res.send(result);
});

app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
  const { usersCollection } = req.collections;
  res.send(await usersCollection.find().toArray());
});

app.get("/users/admin/:email", verifyToken, async (req, res) => {
  const { usersCollection } = req.collections;
  const email = req.params.email;
  if (email !== req.decoded.email) {
    return res.status(403).send({ message: "Forbidden access" });
  }
  const user = await usersCollection.findOne({ email });
  let admin = false;
  if (user) {
    admin = user.role === "admin";
  }
  res.send({ admin });
});

app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).send({ message: "Invalid ID" });
  }
  const { usersCollection } = req.collections;
  const filter = { _id: new ObjectId(req.params.id) };
  const updatedDoc = { $set: { role: 'admin' } };
  res.send(await usersCollection.updateOne(filter, updatedDoc));
});

app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).send({ message: "Invalid ID" });
  }
  const { usersCollection } = req.collections;
  const query = { _id: new ObjectId(req.params.id) };
  res.send(await usersCollection.deleteOne(query));
});

// ================= CARTS API =================
app.get("/carts", verifyToken, async (req, res) => {
  const { cartsCollection } = req.collections;
  const email = req.query.email;
  if (email !== req.decoded.email) {
    return res.status(403).send({ message: "forbidden access" });
  }
  res.send(await cartsCollection.find({ email }).toArray());
});

app.post("/carts", verifyToken, async (req, res) => {
  const { cartsCollection } = req.collections;
  if (req.body.email !== req.decoded.email) {
    return res.status(403).send({ message: "forbidden access" });
  }
  res.send(await cartsCollection.insertOne(req.body));
});

app.delete("/carts/:id", verifyToken, async (req, res) => {
  const { cartsCollection } = req.collections;
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).send({ message: "Invalid ID" });
  }
  const cart = await cartsCollection.findOne({ _id: new ObjectId(req.params.id) });
  if (!cart) {
    return res.status(404).send({ message: "Cart not found" });
  }
  if (cart.email !== req.decoded.email) {
    return res.status(403).send({ message: "Forbidden access" });
  }
  res.send(await cartsCollection.deleteOne({ _id: new ObjectId(req.params.id) }));
});

// ================= PRODUCTS API =================
app.post("/products", verifyToken, verifyAdmin, async (req, res) => {
  const { productsCollection } = req.collections;
  const p = req.body;
  const product = {
    name: p.name, karat: p.karat, image: p.image,
    buyPrice: safe(p.buyPrice), sellPrice: safe(p.sellPrice), stock: safe(p.stock),
    vori: safe(p.vori), ana: safe(p.ana), rati: safe(p.rati), point: safe(p.point),
    createdAt: new Date()
  };
  res.send(await productsCollection.insertOne(product));
});

app.get("/products", async (req, res) => {
  const { productsCollection } = req.collections;
  res.send(await productsCollection.find().sort({ createdAt: -1 }).toArray());
});

app.get('/products/:id', async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).send({ message: "Invalid ID" });
  }
  const { productsCollection } = req.collections;
  const product = await productsCollection.findOne({ _id: new ObjectId(req.params.id) });
  if (!product) {
    return res.status(404).send({ message: "Product not found" });
  }
  res.send(product);
});

app.patch('/products/:id', verifyToken, verifyAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).send({ success: false, message: "Invalid ID" });
  }
  const { productsCollection } = req.collections;
  try {
    const existingProduct = await productsCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!existingProduct) {
      return res.status(404).send({ success: false, message: "Product not found" });
    }
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
    const result = await productsCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: updated });
    res.send({ success: true, message: result.modifiedCount ? "Product updated successfully" : "No changes detected", result });
  } catch (error) {
    res.status(500).send({ success: false, message: "Update failed", error: error.message });
  }
});

app.delete("/products/:id", verifyToken, verifyAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).send({ success: false, message: "Invalid ID" });
  }
  const { productsCollection } = req.collections;
  await productsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
  res.send({ success: true, message: "Product deleted successfully" });
});

// ================= SALES API =================
app.post("/sales", verifyToken, verifyAdmin, async (req, res) => {
  const { salesCollection, productsCollection } = req.collections;
  try {
    const { productId, quantity, sellPrice } = req.body;
    if (!productId || !quantity || !sellPrice) {
      return res.status(400).send({ success: false, message: 'Missing fields' });
    }
    const product = await productsCollection.findOne({ _id: new ObjectId(productId) });
    if (!product) return res.status(404).send({ success: false, message: "Product not found" });

    const qty = safe(quantity);
    const price = safe(sellPrice);
    if (qty <= 0) return res.status(400).send({ success: false, message: "Invalid quantity" });
    if (safe(product.stock) < qty) {
      return res.status(400).send({ success: false, message: "Not enough stock" });
    }

    const revenue = price * qty;
    const cost = safe(product.buyPrice) * qty;
    const profit = revenue - cost;

    const saleDoc = {
      productId: product._id.toString(), productName: product.name, image: product.image || "",
      quantity: qty, sellPrice: price, buyPrice: safe(product.buyPrice), revenue, cost, profit, createdAt: new Date()
    };
    const saleResult = await salesCollection.insertOne(saleDoc);
    await productsCollection.updateOne({ _id: new ObjectId(productId) }, { $inc: { stock: -qty } });
    res.send({ success: true, message: "Sale completed", insertedId: saleResult.insertedId, sale: saleDoc });
  } catch (err) {
    res.status(500).send({ success: false, message: err.message });
  }
});

app.get("/sales", verifyToken, verifyAdmin, async (req, res) => {
  const { salesCollection } = req.collections;
  res.send(await salesCollection.find().toArray());
});

app.delete("/sales/:id", verifyToken, verifyAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).send({ message: "Invalid ID" });
  }
  const { salesCollection, productsCollection } = req.collections;
  try {
    const sale = await salesCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!sale) return res.status(404).send({ success: false, message: "Sale not found" });
    await productsCollection.updateOne({ _id: new ObjectId(sale.productId) }, { $inc: { stock: sale.quantity } });
    await salesCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.send({ success: true });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

// ================= PROFITS API =================
app.post("/profits", verifyToken, verifyAdmin, async (req, res) => {
  const { profitsCollection } = req.collections;
  const data = { note: req.body.note || "", amount: safe(req.body.amount), createdAt: new Date() };
  const result = await profitsCollection.insertOne(data);
  res.send({ success: true, insertedId: result.insertedId });
});

app.get("/profits", verifyToken, verifyAdmin, async (req, res) => {
  const { profitsCollection } = req.collections;
  res.send(await profitsCollection.find().toArray());
});

app.patch("/profits/:id", verifyToken, verifyAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).send({ message: "Invalid ID" });
  const { profitsCollection } = req.collections;
  const result = await profitsCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { note: req.body.note, amount: safe(req.body.amount) } });
  res.send({ success: result.modifiedCount > 0 });
});

app.delete("/profits/:id", verifyToken, verifyAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).send({ message: "Invalid ID" });
  const { profitsCollection } = req.collections;
  const result = await profitsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
  res.send({ success: result.deletedCount > 0 });
});

// ================= STAFF API =================
app.post("/staffs", verifyToken, verifyAdmin, async (req, res) => {
  const { staffCollection } = req.collections;
  const staffData = { ...req.body };
  delete staffData._id;
  res.status(201).send(await staffCollection.insertOne(staffData));
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
  const updatedData = { name: req.body.name, amount: safe(req.body.amount), createdAt: req.body.date ? new Date(req.body.date) : undefined, updatedAt: new Date() };
  await req.collections.receivablesCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: updatedData });
  res.send({ success: true });
});

// ================= TRANSACTIONS API =================
app.get("/transactions", verifyToken, verifyAdmin, async (req, res) => {
  res.send(await req.collections.transactionsCollection.find().toArray());
});

app.post("/transactions", verifyToken, verifyAdmin, async (req, res) => {
  res.send(await req.collections.transactionsCollection.insertOne({ ...req.body, amount: safe(req.body.amount), createdAt: new Date() }));
});

app.delete("/transactions/:id", verifyToken, verifyAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).send({ message: "Invalid ID" });
  res.send(await req.collections.transactionsCollection.deleteOne({ _id: new ObjectId(req.params.id) }));
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
  const result = await req.collections.salesCollection.aggregate([
    { $group: { _id: "$productName", quantity: { $sum: "$quantity" }, revenue: { $sum: "$revenue" } } }
  ]).toArray();
  res.send(result);
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
  const { salesCollection, expensesCollection, reportsCollection } = req.collections;
  try {
    const sales = await salesCollection.find().toArray();
    const expenses = await expensesCollection.find().toArray();
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

    // 🛠️ FIX ৩: পুরানো মঙ্গোডিবি অবজেক্টের আইডি বাদ দিয়ে ডাটা ফরম্যাট করা যাতে insertMany ক্রাশ না করে
    const finalData = Object.values(monthly).map(({ month, revenue, expense }) => ({ month, revenue, expense }));

    await reportsCollection.deleteMany({});
    if (finalData.length > 0) {
      await reportsCollection.insertMany(finalData);
    }
    res.send({ success: true, message: "Monthly report saved", data: finalData });
  } catch (error) {
    res.status(500).send({ message: "Save failed", error: error.message });
  }
});

app.get("/report/monthly", verifyToken, verifyAdmin, async (req, res) => {
  res.send(await req.collections.reportsCollection.find().sort({ month: 1 }).toArray());
});

// ================= COMPLETE ADVANCED DASHBOARD =================
app.get("/dashboard", verifyToken, verifyAdmin, async (req, res) => {
  const { salesCollection, expensesCollection, staffCollection, receivablesCollection, productsCollection, cashListCollection, transactionsCollection } = req.collections;
  try {
    const salesData = await salesCollection.find().toArray();
    const expenses = await expensesCollection.find().toArray();
    const staff = await staffCollection.find().toArray();
    const receivables = await receivablesCollection.find().toArray();
    const products = await productsCollection.find().toArray();
    const cashList = await cashListCollection.find().toArray();
    const transactions = await transactionsCollection.find().toArray();

    const totalSales = salesData.reduce((sum, s) => sum + safe(s.revenue), 0);
    const totalProfit = salesData.reduce((sum, s) => sum + safe(s.profit), 0);
    const totalExpense = expenses.reduce((sum, e) => sum + safe(e.amount), 0);
    const totalStaffSalary = staff.reduce((sum, st) => sum + safe(st.monthlySalary || st.salary), 0);
    const totalReceivable = receivables.reduce((sum, r) => sum + safe(r.amount), 0);
    const totalStock = products.reduce((sum, p) => sum + safe(p.stock), 0);
    const totalStockValue = products.reduce((sum, p) => sum + (safe(p.stock) * safe(p.buyPrice)), 0);
    const totalCashListFromList = cashList.reduce((sum, c) => sum + safe(c.amount), 0);

    let totalTransactionPlus = 0;
    let totalTransactionMinus = 0;
    transactions.forEach((t) => {
      if (t?.type === "plus") totalTransactionPlus += safe(t.amount);
      if (t?.type === "minus") totalTransactionMinus += safe(t.amount);
    });

    // 🛠️ FIX ২: totalSales-এর সাথে totalProfit আর আলাদা করে যোগ করা হবে না (অ্যাকাউন্টিং স্ট্যান্ডার্ড ফিক্স)
    const totalCash = (totalSales + totalCashListFromList + totalTransactionPlus) - (totalExpense + totalReceivable + totalStaffSalary + totalTransactionMinus);

    res.send({
      totalSales, totalProfit, totalExpense, totalStaffSalary, totalReceivable,
      totalStock, totalStockValue, totalCashFromList: totalCashListFromList,
      totalTransactionPlus, totalTransactionMinus, totalCash
    });
  } catch (error) {
    console.error("DASHBOARD ERROR:", error);
    res.status(500).send({ success: false, message: "Dashboard data fetch failed", error: error.message });
  }
});

app.get("/", (req, res) => {
  res.send("💎 AL AMIN JEWELLERS SERVER IS READY FOR VERCEL");
});

// ================= LOCALHOST TRICK =================
if (process.env.NODE_ENV !== "production") {
  const port = process.env.PORT || 5000;
  app.listen(port, () => {
    console.log(`🚀 Local Server running on port ${port}`);
  });
}

module.exports = app;