require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

// ================= SAFE NUMBER =================
const safe = (v) => (isNaN(Number(v)) ? 0 : Number(v));

// ================= VALID OBJECT ID =================
const validateId = (req, res, next) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).send({ success: false, message: "Invalid Object ID" });
  }
  next();
};

// ================= MIDDLEWARE =================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://shop-jewellers-client.web.app",
      "https://shop-jewellers-client.firebaseapp.com",
    ],
    credentials: true,
  })
);

// ================= RATE LIMIT =================
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
});
app.use(limiter);

// ================= MONGODB CONFIG =================
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rd6jhgv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Global DB and Collections variables
let db = null;
let productsCollection;
let usersCollection;
let salesCollection;
let expensesCollection;
let receivablesCollection;
let transactionsCollection;
let cashListCollection;
let staffCollection;
let profitsCollection;
let reportsCollection;
let cartsCollection;

// ================= VERCEL SERVERLESS DB CONNECTION MIDDLEWARE =================
// এই মিডলওয়্যারটি ভার্সেলের সার্ভারলেস ক্র্যাশ হওয়া ১০০% বন্ধ করবে।
app.use(async (req, res, next) => {
  try {
    if (!db) {
      await client.connect();
      db = client.db("shopDb");
      productsCollection = db.collection("products");
      usersCollection = db.collection("users");
      salesCollection = db.collection("sales");
      expensesCollection = db.collection("expenses");
      receivablesCollection = db.collection("receivables");
      transactionsCollection = db.collection("transactions");
      cashListCollection = db.collection("cashList");
      staffCollection = db.collection("staffs");
      profitsCollection = db.collection("profits");
      reportsCollection = db.collection("reports");
      cartsCollection = db.collection("carts");
      console.log("✅ MongoDB Connected in Serverless Scope");
    }
    next();
  } catch (error) {
    console.error("🚨 MongoDB Lazy Connection Error:", error);
    res.status(500).send({ success: false, message: "Database connection failed" });
  }
});

// ================= VERIFY TOKEN MIDDLEWARE =================
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ success: false, message: "Unauthorized Access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ success: false, message: "Forbidden Access" });
    }
    req.decoded = decoded;
    next();
  });
};

// ================= VERIFY ADMIN MIDDLEWARE =================
const verifyAdmin = async (req, res, next) => {
  try {
    const email = req.decoded.email;
    const user = await usersCollection.findOne({ email });
    if (user?.role !== "admin") {
      return res.status(403).send({ success: false, message: "Admin only route" });
    }
    next();
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
};

// ================= BASE ROUTE =================
app.get("/", (req, res) => {
  res.send({ success: true, message: "Shop Jewellers Server Running" });
});

// ================= JWT ROUTE =================
app.post("/jwt", async (req, res) => {
  try {
    const user = req.body;
    if (!user?.email) {
      return res.status(400).send({ success: false, message: "Email Required" });
    }
    if (!process.env.ACCESS_TOKEN_SECRET) {
      return res.status(500).send({ success: false, message: "JWT Secret Missing" });
    }
    const token = jwt.sign({ email: user.email }, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn: "7d",
    });
    res.send({ token });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

// ================= USERS API =================
app.post("/users", async (req, res) => {
  try {
    const user = req.body;
    if (!user?.email) {
      return res.status(400).send({ success: false, message: "Email Required" });
    }
    const existingUser = await usersCollection.findOne({ email: user.email });
    if (existingUser) {
      return res.send({ success: true, message: "User already exists" });
    }
    const newUser = {
      name: user.name || "Anonymous",
      email: user.email,
      image: user.image || "https://i.ibb.co/vHZ369b/placeholder.png", // সচল ইমেজ হোল্ডার লিংক
      role: "user",
      createdAt: new Date(),
    };
    const result = await usersCollection.insertOne(newUser);
    res.send(result);
  } catch (error) {
    console.log(error);
    res.status(500).send({ success: false, message: error.message });
  }
});

app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const result = await usersCollection.find().toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

app.get("/users/admin/:email", verifyToken, async (req, res) => {
  try {
    const email = req.params.email;
    if (email !== req.decoded.email) {
      return res.status(403).send({ success: false, message: "Forbidden" });
    }
    const user = await usersCollection.findOne({ email });
    res.send({ admin: user?.role === "admin" });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

app.patch("/users/admin/:id", verifyToken, verifyAdmin, validateId, async (req, res) => {
  try {
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { role: "admin" } }
    );
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

app.delete("/users/:id", verifyToken, verifyAdmin, validateId, async (req, res) => {
  try {
    const result = await usersCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

// ================= CARTS API =================
app.get("/carts", verifyToken, async (req, res) => {
  try {
    if (req.query.email !== req.decoded.email) {
      return res.status(403).send({ success: false, message: "Forbidden" });
    }
    const result = await cartsCollection.find({ email: req.query.email }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

app.post("/carts", verifyToken, async (req, res) => {
  try {
    if (req.body.email !== req.decoded.email) {
      return res.status(403).send({ success: false, message: "Forbidden" });
    }
    const result = await cartsCollection.insertOne(req.body);
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

app.delete("/carts/:id", verifyToken, validateId, async (req, res) => {
  try {
    const id = req.params.id;
    const cart = await cartsCollection.findOne({ _id: new ObjectId(id) });
    if (!cart) {
      return res.status(404).send({ success: false, message: "Cart not found" });
    }
    if (cart.email !== req.decoded.email) {
      return res.status(403).send({ success: false, message: "Forbidden access" });
    }
    const result = await cartsCollection.deleteOne({ _id: new ObjectId(id) });
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: "Cart item deletion failed" });
  }
});

// ================= PRODUCTS API =================
app.post("/products", verifyToken, verifyAdmin, async (req, res) => {
  try {
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
      createdAt: new Date(),
    };
    const result = await productsCollection.insertOne(product);
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

app.get("/products", async (req, res) => {
  try {
    const result = await productsCollection.find().sort({ createdAt: -1 }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

app.get("/products/:id", validateId, async (req, res) => {
  try {
    const product = await productsCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!product) {
      return res.status(404).send({ success: false, message: "Product not found" });
    }
    res.send(product);
  } catch (error) {
    res.status(500).send({ success: false, message: "Product fetch failed" });
  }
});

app.get("/products/low-stock", async (req, res) => {
  try {
    const result = await productsCollection.find({ stock: { $lt: 5 } }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Low stock check failed" });
  }
});

app.patch("/products/:id", verifyToken, verifyAdmin, validateId, async (req, res) => {
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
      updatedAt: new Date(),
    };
    const result = await productsCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: updated });
    res.send({
      success: true,
      message: result.modifiedCount ? "Product updated successfully" : "No changes detected",
    });
  } catch (error) {
    res.status(500).send({ success: false, message: "Update failed", error: error.message });
  }
});

app.delete("/products/:id", verifyToken, verifyAdmin, validateId, async (req, res) => {
  try {
    await productsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.send({ success: true, message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).send({ success: false, message: "Product deletion failed" });
  }
});

// ================= SALES API =================
app.post("/sales", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { productId, quantity, sellPrice } = req.body;
    if (!productId || !quantity || !sellPrice) {
      return res.status(400).send({ success: false, message: "Missing fields" });
    }
    if (!ObjectId.isValid(productId)) {
      return res.status(400).send({ success: false, message: "Invalid Product ID" });
    }
    const product = await productsCollection.findOne({ _id: new ObjectId(productId) });
    if (!product) {
      return res.status(404).send({ success: false, message: "Product not found" });
    }
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
      revenue,
      cost,
      profit,
      createdAt: new Date(),
    };
    const saleResult = await salesCollection.insertOne(saleDoc);
    await productsCollection.updateOne({ _id: new ObjectId(productId) }, { $inc: { stock: -qty } });
    res.send({ success: true, message: "Sale completed", insertedId: saleResult.insertedId });
  } catch (err) {
    res.status(500).send({ success: false, message: err.message });
  }
});

app.get("/sales", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const result = await salesCollection.find().toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: "Sales fetch failed" });
  }
});

app.delete("/sales/:id", verifyToken, verifyAdmin, validateId, async (req, res) => {
  try {
    const sale = await salesCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!sale) return res.status(404).send({ success: false, message: "Sale not found" });
    if (ObjectId.isValid(sale.productId)) {
      await productsCollection.updateOne({ _id: new ObjectId(sale.productId) }, { $inc: { stock: sale.quantity } });
    }
    await salesCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.send({ success: true, message: "Sale cancelled and stock restored" });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

// ================= PROFITS API =================
app.post("/profits", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const data = { note: req.body.note || "", amount: safe(req.body.amount), createdAt: new Date() };
    const result = await profitsCollection.insertOne(data);
    res.send({ success: true, insertedId: result.insertedId });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to insert profit record" });
  }
});

app.get("/profits", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const result = await profitsCollection.find().toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: "Profits fetch failed" });
  }
});

// ================= STAFF API =================
app.post("/staffs", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const staffData = { ...req.body };
    delete staffData._id;
    const result = await staffCollection.insertOne(staffData);
    res.status(201).send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: "Staff addition failed" });
  }
});

app.get("/staffs", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const result = await staffCollection.find().toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: "Staff fetch failed" });
  }
});

app.delete("/staffs/:id", verifyToken, verifyAdmin, validateId, async (req, res) => {
  try {
    const result = await staffCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: "Staff deletion failed" });
  }
});

// ================= EXPENSES API =================
app.post("/expenses", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const result = await expensesCollection.insertOne({ ...req.body, amount: safe(req.body.amount), createdAt: new Date() });
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: "Expense addition failed" });
  }
});

app.get("/expenses", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const result = await expensesCollection.find().sort({ createdAt: -1 }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: "Expenses fetch failed" });
  }
});

// ================= RECEIVABLE API =================
app.post("/receivables", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const data = {
      name: req.body.name,
      amount: safe(req.body.amount),
      createdAt: req.body.date ? new Date(req.body.date) : new Date(),
      updatedAt: null,
    };
    const result = await receivablesCollection.insertOne(data);
    res.send({ success: true, insertedId: result.insertedId });
  } catch (error) {
    res.status(500).send({ success: false, message: "Receivable creation failed" });
  }
});

app.get("/receivables", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const result = await receivablesCollection.find().sort({ createdAt: -1 }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: "Receivables fetch failed" });
  }
});

// ================= TRANSACTIONS API =================
app.get("/transactions", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const result = await transactionsCollection.find().sort({ createdAt: -1 }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to fetch transactions" });
  }
});

// ================= CASH LIST API =================
app.get("/cash-list", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const result = await cashListCollection.find().sort({ createdAt: -1 }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to fetch cash list" });
  }
});

// ================= DASHBOARD ROUTE =================
app.get("/dashboard", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const salesData = await salesCollection.find().toArray();
    const expenses = await expensesCollection.find().toArray();
    const staff = await staffCollection.find().toArray();
    const receivables = await receivablesCollection.find().toArray();
    const cashList = await cashListCollection.find().toArray();
    const products = await productsCollection.find().toArray();

    const totalSales = salesData.reduce((sum, s) => sum + safe(s.revenue), 0);
    const totalCash = cashList.reduce((sum, c) => sum + safe(c.amount), 0);
    const totalExpense = expenses.reduce((sum, e) => sum + safe(e.amount), 0);
    const totalStock = products.reduce((sum, p) => sum + safe(p.stock), 0);

    res.send({
      success: true,
      stats: {
        totalSales,
        totalCash,
        totalExpense,
        totalStock,
        totalStaff: staff.length,
        totalReceivables: receivables.length,
      },
    });
  } catch (error) {
    res.status(500).send({ success: false, message: "Dashboard data fetch failed" });
  }
});

// ================= GLOBAL ERROR =================
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send({ success: false, message: err.message });
});

// ================= LOCAL SERVER =================
if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => {
    console.log(`🚀 Server Running On Port ${port}`);
  });
}

// ================= EXPORT =================
module.exports = app;