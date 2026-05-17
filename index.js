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
  if (db) return db; // কানেকশন থাকলে নতুন করে কানেক্ট করবে না (Vercel Optimization)

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
    return res.status(401).send({
      message: "Unauthorized access",
    });
  }

  const token = authHeader.split(" ")[1];

  jwt.verify(
    token,
    process.env.ACCESS_TOKEN_SECRET,
    (err, decoded) => {

      if (err) {
        return res.status(403).send({
          message: "Forbidden access",
        });
      }

      req.decoded = decoded;
      next();
    }
  );
};

// ================= VERIFY ADMIN =================
const verifyAdmin = async (req, res, next) => {

  const { usersCollection } = req.collections;

  const user = await usersCollection.findOne({
    email: req.decoded.email,
  });

  if (!user || user.role !== "admin") {
    return res.status(403).send({
      message: "Forbidden access",
    });
  }

  next();
};

// ================= JWT AUTHENTICATION =================
app.post("/jwt", (req, res) => {

  const user = req.body;

  if (!user?.email) {
    return res.status(400).send({
      message: "Email required",
    });
  }

  const token = jwt.sign(
    { email: user.email },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "7d" }
  );

  res.send({ token });
});

// ================= USERS API =================
app.post("/users", async (req, res) => {
  const { usersCollection } = req.collections;
  const exist = await usersCollection.findOne({ email: req.body.email });
  if (exist) return res.send({ message: "user already exists", insertedId: null });
  res.send(await usersCollection.insertOne(req.body));
});

// এডমিন প্যানেলের জন্য সমস্ত ইউজার লিস্ট দেখার রুট (শুধু এডমিন পারবে)
app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
  const { usersCollection } = req.collections;
  res.send(await usersCollection.find().toArray());
});

// কোনো ইউজার অ্যাডমিন কিনা তা চেক করার রুট (useAdmin হুক এখান থেকে ডেটা নেয়)
app.get("/users/admin/:email", verifyToken, async (req, res) => {
  const { usersCollection } = req.collections; // 🔥 ফিক্সড: কালেকশন মিসিং ছিল
  const email = req.params.email;

  if (email !== req.decoded.email) {
    return res.status(403).send({ message: "Forbidden access" });
  }

  const query = { email: email };
  const user = await usersCollection.findOne(query);

  let admin = false;
  if (user) {
    admin = user.role === "admin";
  }
  res.send({ admin });
});

app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
  const { usersCollection } = req.collections;
  const filter = { _id: new ObjectId(req.params.id) };
  const updatedDoc = { $set: { role: 'admin' } };
  res.send(await usersCollection.updateOne(filter, updatedDoc));
});

app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
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

app.post("/carts", async (req, res) => {
  const { cartsCollection } = req.collections;
  res.send(await cartsCollection.insertOne(req.body));
});

app.delete("/carts/:id", async (req, res) => {
  const { cartsCollection } = req.collections;
  res.send(await cartsCollection.deleteOne({ _id: new ObjectId(req.params.id) }));
});

// ================= PRODUCTS API =================
app.post("/products", verifyToken, verifyAdmin, async (req, res) => {
  const { productsCollection } = req.collections;
  const p = req.body;
  const product = {
    name: p.name,
    karat: p.karat,
    image: p.image,
    buyPrice: safe(p.buyPrice),
    sellPrice: safe(p.sellPrice),
    stock: safe(p.stock),
    vori: safe(p.vori),
    ana: safe(p.ana),
    rati: safe(p.rati),
    point: safe(p.point),
    createdAt: new Date()
  };
  res.send(await productsCollection.insertOne(product));
});

app.get("/products", async (req, res) => {
  const { productsCollection } = req.collections;
  res.send(await productsCollection.find().sort({ createdAt: -1 }).toArray());
});

app.get('/products/:id', async (req, res) => {
  const { productsCollection } = req.collections;
  try {
    const product = await productsCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!product) return res.status(404).send({ message: "Product not found" });
    res.send(product);
  } catch (error) {
    res.status(500).send({ message: "Invalid ID" });
  }
});

app.patch('/products/:id', verifyToken, verifyAdmin, async (req, res) => {
  const { productsCollection } = req.collections;
  try {
    const updated = {
      name: req.body.name,
      sellPrice: safe(req.body.sellPrice),
      vori: safe(req.body.vori),
      ana: safe(req.body.ana),
      rati: safe(req.body.rati),
      point: safe(req.body.point),
      stock: safe(req.body.stock),
    };
    if (req.body.createdAt) {
      const date = new Date(req.body.createdAt);
      if (!isNaN(date)) updated.createdAt = date;
    }
    const result = await productsCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updated }
    );
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Update failed" });
  }
});

app.delete('/products/:id', verifyToken, verifyAdmin, async (req, res) => {
  const { productsCollection } = req.collections;
  res.send(await productsCollection.deleteOne({ _id: new ObjectId(req.params.id) }));
});

app.get("/products/low-stock", async (req, res) => {
  const { productsCollection } = req.collections;
  try {
    const products = await productsCollection.find().toArray();
    const lowStock = products.filter(p => safe(p.stock) <= 5);
    res.send(lowStock);
  } catch (err) {
    res.status(500).send({ message: "Failed to fetch low stock" });
  }
});

// ================= SALES API =================
app.post("/sales", verifyToken, async (req, res) => {
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
      productId: product._id.toString(),
      productName: product.name,
      image: product.image || "",
      quantity: qty,
      sellPrice: price,
      buyPrice: safe(product.buyPrice),
      revenue,
      cost,
      profit,
      createdAt: new Date()
    };

    const saleResult = await salesCollection.insertOne(saleDoc);
    await productsCollection.updateOne(
      { _id: new ObjectId(productId) },
      { $inc: { stock: -qty } }
    );

    res.send({ success: true, message: "Sale completed", insertedId: saleResult.insertedId, sale: saleDoc });
  } catch (err) {
    res.status(500).send({ success: false, message: err.message });
  }
});

app.get("/sales", async (req, res) => {
  const { salesCollection } = req.collections;
  res.send(await salesCollection.find().toArray());
});

app.delete("/sales/:id", verifyToken, verifyAdmin, async (req, res) => {
  const { salesCollection } = req.collections;
  await salesCollection.deleteOne({ _id: new ObjectId(req.params.id) });
  res.send({ success: true });
});

// ================= PROFITS API =================
app.post("/profits", async (req, res) => {
  const { profitsCollection } = req.collections;
  try {
    const data = {
      note: req.body.note || "",
      amount: safe(req.body.amount),
      createdAt: new Date()
    };
    const result = await profitsCollection.insertOne(data);
    res.send({ success: true, insertedId: result.insertedId });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

app.get("/profits", async (req, res) => {
  const { profitsCollection } = req.collections;
  res.send(await profitsCollection.find().toArray());
});

app.patch("/profits/:id", async (req, res) => {
  const { profitsCollection } = req.collections;
  const result = await profitsCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { note: req.body.note, amount: safe(req.body.amount) } }
  );
  res.send({ success: result.modifiedCount > 0 });
});

app.delete("/profits/:id", async (req, res) => {
  const { profitsCollection } = req.collections;
  const result = await profitsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
  res.send({ success: result.deletedCount > 0 });
});

/// ================= STAFF API =================

// 1. Create New Staff
app.post("/staffs", async (req, res) => {
  const { staffCollection } = req.collections;
  try {
    // Body theke safety check er jonno _id thakle delete kore deya bhalo
    const staffData = { ...req.body };
    delete staffData._id;

    const result = await staffCollection.insertOne(staffData);
    res.status(201).send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

// 2. Get All Staffs
app.get("/staffs", async (req, res) => {
  const { staffCollection } = req.collections;
  try {
    const result = await staffCollection.find().toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

// 3. Get Single Staff by ID
app.get("/staffs/:id", async (req, res) => {
  const { staffCollection } = req.collections;
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ success: false, message: "Invalid staff ID format" });
    }

    const staff = await staffCollection.findOne({ _id: new ObjectId(id) });
    if (!staff) {
      return res.status(404).send({ success: false, message: "Staff not found" });
    }
    res.send(staff);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

// 4. Update Staff (PUT - Full Data Sync)
app.put("/staffs/:id", async (req, res) => {
  const { staffCollection } = req.collections;
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ success: false, message: "Invalid ID format" });
    }

    if (!req.body.name || req.body.monthlySalary == null) {
      return res.status(400).send({ success: false, message: "Missing required fields (name or monthlySalary)" });
    }

    // CRITICAL FIX: Destructure kore payload separation, jate backend-e _id overwrite crash na khay
    const { _id, ...updateData } = req.body;

    const result = await staffCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

// 5. Partial Update Staff (PATCH)
app.patch("/staffs/:id", async (req, res) => {
  const { staffCollection } = req.collections;
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ success: false, message: "Invalid ID format" });
    }

    const { _id, ...patchData } = req.body;

    const result = await staffCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: patchData }
    );
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

// 6. Delete Staff
app.delete("/staffs/:id", async (req, res) => {
  const { staffCollection } = req.collections;
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ success: false, message: "Invalid ID format" });
    }

    const result = await staffCollection.deleteOne({ _id: new ObjectId(id) });
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

// ================= EXPENSES API =================
app.post("/expenses", async (req, res) => {
  const { expensesCollection } = req.collections;
  res.send(await expensesCollection.insertOne({ ...req.body, amount: safe(req.body.amount), createdAt: new Date() }));
});

app.get("/expenses", async (req, res) => {
  const { expensesCollection } = req.collections;
  res.send(await expensesCollection.find().sort({ createdAt: -1 }).toArray());
});

app.patch("/expenses/:id", async (req, res) => {
  const { expensesCollection } = req.collections;
  const updateDoc = { $set: { title: req.body.title, amount: safe(req.body.amount) } };
  res.send(await expensesCollection.updateOne({ _id: new ObjectId(req.params.id) }, updateDoc));
});

app.delete("/expenses/:id", async (req, res) => {
  const { expensesCollection } = req.collections;
  res.send(await expensesCollection.deleteOne({ _id: new ObjectId(req.params.id) }));
});

// ================= RECEIVABLE API =================
app.post("/receivables", async (req, res) => {
  const { receivablesCollection } = req.collections;
  try {
    const data = {
      name: req.body.name,
      amount: safe(req.body.amount),
      createdAt: req.body.date ? new Date(req.body.date) : new Date(),
      updatedAt: null,
    };
    const result = await receivablesCollection.insertOne(data);
    res.send({ success: true, insertedId: result.insertedId });
  } catch (err) {
    res.status(500).send({ message: "Insert failed" });
  }
});

app.get("/receivables", async (req, res) => {
  const { receivablesCollection } = req.collections;
  res.send(await receivablesCollection.find().sort({ createdAt: -1 }).toArray());
});

app.patch("/receivables/:id", async (req, res) => {
  const { receivablesCollection } = req.collections;
  try {
    const updatedData = {
      name: req.body.name,
      amount: safe(req.body.amount),
      createdAt: req.body.date ? new Date(req.body.date) : undefined,
      updatedAt: new Date(),
    };
    await receivablesCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: updatedData });
    res.send({ success: true });
  } catch (err) {
    res.status(500).send({ message: "Update failed" });
  }
});

// ================= TRANSACTIONS API =================
app.get("/transactions", async (req, res) => {
  const { transactionsCollection } = req.collections;
  res.send(await transactionsCollection.find().toArray());
});

app.post("/transactions", async (req, res) => {
  const { transactionsCollection } = req.collections;
  res.send(await transactionsCollection.insertOne({ ...req.body, amount: safe(req.body.amount), createdAt: new Date() }));
});

app.delete("/transactions/:id", async (req, res) => {
  const { transactionsCollection } = req.collections;
  try {
    res.send(await transactionsCollection.deleteOne({ _id: new ObjectId(req.params.id) }));
  } catch (error) {
    res.status(500).send({ message: "Delete failed" });
  }
});

// ================= CASH LIST API =================
app.post("/cash-list", async (req, res) => {
  const { cashListCollection } = req.collections;
  try {
    const now = new Date();
    const data = {
      title: req.body.title,
      amount: safe(req.body.amount),
      createdAt: now,
      date: now.toLocaleDateString("en-GB"),
      time: now.toLocaleTimeString("en-GB"),
    };
    res.send(await cashListCollection.insertOne(data));
  } catch (error) {
    res.status(500).send({ message: "Cash add failed" });
  }
});

app.get("/cash-list", async (req, res) => {
  const { cashListCollection } = req.collections;
  res.send(await cashListCollection.find().sort({ createdAt: -1 }).toArray());
});

app.patch("/cash-list/:id", async (req, res) => {
  const { cashListCollection } = req.collections;
  const result = await cashListCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { title: req.body.title, amount: safe(req.body.amount) } }
  );
  res.send(result);
});

app.delete("/cash-list/:id", async (req, res) => {
  const { cashListCollection } = req.collections;
  res.send(await cashListCollection.deleteOne({ _id: new ObjectId(req.params.id) }));
});

app.get("/cash-total", async (req, res) => {
  const { cashListCollection } = req.collections;
  const cash = await cashListCollection.find().toArray();
  const total = cash.reduce((sum, c) => sum + safe(c.amount), 0);
  res.send({ total });
});

// ================= ANALYTICS & REPORTS =================
app.get("/admin-stats", async (req, res) => {
  const { salesCollection } = req.collections;
  try {
    const result = await salesCollection.aggregate([
      {
        $group: {
          _id: "$productName",
          quantity: { $sum: "$quantity" },
          revenue: { $sum: "$revenue" }
        }
      }
    ]).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Server error" });
  }
});

app.get("/analytics/daily", async (req, res) => {
  const { salesCollection } = req.collections;
  try {
    const sales = await salesCollection.find().toArray();
    const days = {};
    sales.forEach(s => {
      if (!s.createdAt) return;
      const date = new Date(s.createdAt).toISOString().split("T")[0];
      if (!days[date]) {
        days[date] = { date, totalSales: 0, profit: 0, count: 0 };
      }
      days[date].totalSales += safe(s.revenue);
      days[date].profit += safe(s.profit);
      days[date].count += 1;
    });
    res.send(Object.values(days));
  } catch (err) {
    res.status(500).send({ message: "Analytics failed" });
  }
});

app.post("/report/monthly/save", async (req, res) => {
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

    const finalData = Object.values(monthly);
    await reportsCollection.deleteMany({});
    if (finalData.length > 0) {
      await reportsCollection.insertMany(finalData);
    }
    res.send({ success: true, message: "Monthly report saved", data: finalData });
  } catch (error) {
    res.status(500).send({ message: "Save failed" });
  }
});

app.get("/report/monthly", verifyToken, async (req, res) => {
  const { reportsCollection } = req.collections;
  try {
    res.send(await reportsCollection.find().sort({ month: 1 }).toArray());
  } catch (error) {
    res.status(500).send({ message: "Monthly report failed" });
  }
});

// ================= COMPLETE ADVANCED DASHBOARD =================
app.get("/dashboard", verifyToken, async (req, res) => {
  const {
    salesCollection,
    expensesCollection,
    staffCollection,
    receivablesCollection,
    productsCollection,
    cashListCollection,
    transactionsCollection
  } = req.collections;

  try {
    const salesData = await salesCollection.find().toArray();
    const expenses = await expensesCollection.find().toArray();
    const staff = await staffCollection.find().toArray();
    const receivables = await receivablesCollection.find().toArray();
    const products = await productsCollection.find().toArray();
    const cashList = await cashListCollection.find().toArray();
    const transactions = await transactionsCollection.find().toArray();

    // Calculations (সবচেয়ে উপরে ডিক্লেয়ার করা গ্লোবাল safe() ফাংশনটি ব্যবহার করা হয়েছে)
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

    const totalCash =
      (totalSales + totalProfit + totalCashListFromList + totalTransactionPlus) -
      (totalExpense + totalReceivable + totalStaffSalary + totalTransactionMinus);

    res.send({
      totalSales,
      totalProfit,
      totalExpense,
      totalStaffSalary,
      totalReceivable,
      totalStock,
      totalStockValue,
      totalCashFromList: totalCashListFromList,
      totalTransactionPlus,
      totalTransactionMinus,
      totalCash
    });

  } catch (error) {
    console.error("DASHBOARD ERROR:", error);
    res.status(500).send({ success: false, message: "Dashboard data fetch failed", error: error.message });
  }
});

app.get("/", (req, res) => {
  res.send(" AL AMIN JEWELLERS SERVER IS READY FOR VERCEL");
});

// ================= LOCALHOST TRICK =================
if (process.env.NODE_ENV !== "production") {
  const port = process.env.PORT || 5000;
  app.listen(port, () => {
    console.log(` Local Server running on port ${port}`);
  });
}

// Vercel হ্যান্ডেল করার জন্য এক্সপোর্ট
module.exports = app;