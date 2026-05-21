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


// ================= MIDDLEWARE & CORS FIXED =================
const corsOptions = {
  origin: [
    'https://shop-jewellers-client.web.app', // আপনার মেইন লাইভ সাইট
    'http://localhost:5173'                  // লোকালহোস্টে টেস্ট করার জন্য
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
};
app.use(cors(corsOptions));
app.use(express.json());


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
    const token = jwt.sign({ email: user.email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "7d" });
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


    // ইমেইল দিয়ে ডাটাবেজে অলরেডি ইউজার আছে কিনা চেক করা
    const existingUser = await usersCollection.findOne({ email: user.email });
    if (existingUser) {
      // ইউজার অলরেডি থাকলে সাকসেস ট্রু সহ রেসপন্স পাঠানো, যাতে ফ্রন্টএন্ডে এরর না দেয়
      return res.send({ success: true, message: "User already exists", insertedId: existingUser._id });
    }


    // নতুন ইউজার ডাটা স্ট্রাকচার
    const newUser = {
      name: user.name || "Anonymous",
      email: user.email,
      image: user.image || "https://i.ibb.co/vHZ369b/placeholder.png",
      role: user.role || "user",
      createdAt: new Date(),
    };


    const result = await usersCollection.insertOne(newUser);
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});


// 🔓 GET: verifyAdmin সরানো হয়েছে যেন স্টাফরা ইউজার তালিকা দেখতে পারে (প্রয়োজন সাপেক্ষে)
app.get("/users", verifyToken, async (req, res) => {
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


// 🔒 PATCH/DELETE: এডমিন লক বহাল আছে
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
// 🔒 POST: শুধুমাত্র এডমিন প্রোডাক্ট অ্যাড করতে পারবে
app.post("/products", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const p = req.body;
    const product = {
      name: p.name,
      category: p.category || "",
      karat: p.karat,
      image: p.image,
      buyPrice: safe(p.buyPrice),
      sellPrice: safe(p.sellPrice),
      stock: safe(p.stock),
      vori: safe(p.vori),
      ana: safe(p.ana),
      rati: safe(p.rati),
      point: safe(p.point),
      createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
    };
    const result = await productsCollection.insertOne(product);
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});


// 🔓 GET: সবাই প্রোডাক্ট দেখতে পারবে
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


// 🔒 PATCH/DELETE: শুধুমাত্র এডমিন আপডেট/ডিলিট করবে
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
    res.send(result);
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
// 🔒 POST/PATCH/DELETE: শুধুমাত্র এডমিন সেলস এন্ট্রি ও এডিট করবে
app.post("/sales", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { productId, quantity, sellPrice } = req.body;
    if (!productId || !quantity || !sellPrice) {
      return res.status(400).send({ success: false, message: "Missing fields" });
    }
    const product = await productsCollection.findOne({ _id: new ObjectId(productId) });
    if (!product) {
      return res.status(404).send({ success: false, message: "Product not found" });
    }
    const qty = safe(quantity);
    const price = safe(sellPrice);
    if (qty <= 0 || safe(product.stock) < qty) {
      return res.status(400).send({ success: false, message: "Invalid stock or quantity" });
    }
    const revenue = price * qty;
    const cost = safe(product.buyPrice) * qty;
    const saleDoc = {
      productId: product._id.toString(),
      productName: product.name,
      image: product.image || "",
      quantity: qty,
      sellPrice: price,
      buyPrice: safe(product.buyPrice),
      revenue,
      cost,
      profit: revenue - cost,
      createdAt: new Date(),
    };
    const saleResult = await salesCollection.insertOne(saleDoc);
    await productsCollection.updateOne(
      { _id: new ObjectId(productId) },
      { $inc: { stock: -qty } }
    );
    res.send(saleResult);
  } catch (err) {
    res.status(500).send({ success: false, message: err.message });
  }
});


// 🔓 GET: verifyAdmin সরানো হয়েছে যেন স্টাফরাও সেলস রেকর্ড দেখতে পারে
app.get("/sales", verifyToken, async (req, res) => {
  try {
    const result = await salesCollection.find().toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: "Sales fetch failed" });
  }
});


app.patch("/sales/:id", verifyToken, verifyAdmin, validateId, async (req, res) => {
  try {
    const existingSale = await salesCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!existingSale) return res.status(404).send({ success: false, message: "Sale record not found" });
    const newQty = req.body.quantity !== undefined ? safe(req.body.quantity) : existingSale.quantity;
    const newPrice = req.body.sellPrice !== undefined ? safe(req.body.sellPrice) : existingSale.sellPrice;
    const qtyDifference = newQty - existingSale.quantity;
    if (qtyDifference !== 0) {
      const product = await productsCollection.findOne({ _id: new ObjectId(existingSale.productId) });
      if (product && safe(product.stock) < qtyDifference) {
        return res.status(400).send({ success: false, message: "Insufficient product stock for update" });
      }
      await productsCollection.updateOne(
        { _id: new ObjectId(existingSale.productId) },
        { $inc: { stock: -qtyDifference } }
      );
    }
    const revenue = newPrice * newQty;
    const cost = existingSale.buyPrice * newQty;
    const result = await salesCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { quantity: newQty, sellPrice: newPrice, revenue, cost, profit: revenue - cost, updatedAt: new Date() } }
    );
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});


app.delete("/sales/:id", verifyToken, verifyAdmin, validateId, async (req, res) => {
  try {
    const sale = await salesCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!sale) return res.status(404).send({ success: false, message: "Sale not found" });
    if (sale.productId) {
      try {
        await productsCollection.updateOne(
          { _id: new ObjectId(sale.productId) },
          { $inc: { stock: safe(sale.quantity) } }
        );
      } catch (stockErr) {
        console.error("Failed to restore product stock during sale deletion:", stockErr);
      }
    }
    const result = await salesCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});


// ================= PROFITS API =================
// 🔒 POST/PATCH/DELETE: এডমিন অনলি
app.post("/profits", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const p = req.body;
    const data = { note: p.note || "", amount: safe(p.amount), createdAt: p.createdAt ? new Date(p.createdAt) : new Date() };
    const result = await profitsCollection.insertOne(data);
    res.send({ success: true, insertedId: result.insertedId });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to insert profit record" });
  }
});


// 🔓 GET: verifyAdmin সরানো হয়েছে
app.get("/profits", verifyToken, async (req, res) => {
  try {
    const result = await profitsCollection.find().sort({ createdAt: -1 }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: "Profits fetch failed" });
  }
});


app.patch("/profits/:id", verifyToken, verifyAdmin, validateId, async (req, res) => {
  try {
    const existing = await profitsCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!existing) {
      return res.status(404).send({ success: false, message: "Profit record not found" });
    }
    const p = req.body;
    const updatedData = {
      note: p.note !== undefined ? p.note : existing.note,
      amount: p.amount !== undefined ? safe(p.amount) : existing.amount,
      createdAt: p.createdAt ? new Date(p.createdAt) : existing.createdAt,
      updatedAt: new Date()
    };
    const result = await profitsCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updatedData }
    );
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});


app.delete("/profits/:id", verifyToken, verifyAdmin, validateId, async (req, res) => {
  try {
    const result = await profitsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});


// ================= CASH LIST API =================
// 🔒 POST/PATCH/DELETE: এডমিন অনলি
app.post("/cash-list", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const p = req.body;
    const cashData = {
      title: p.title || "Untitled Cash Entry",
      amount: safe(p.amount),
      date: p.date || "",
      time: p.time || "",
      note: p.note || "",
      createdAt: p.createdAt ? new Date(p.createdAt) : new Date()
    };
    const result = await cashListCollection.insertOne(cashData);
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});


// 🔓 GET: verifyAdmin সরানো হয়েছে
app.get("/cash-list", verifyToken, async (req, res) => {
  try {
    const result = await cashListCollection.find().sort({ createdAt: -1 }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to fetch cash list" });
  }
});


app.patch("/cash-list/:id", verifyToken, verifyAdmin, validateId, async (req, res) => {
  try {
    const existing = await cashListCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!existing) {
      return res.status(404).send({ success: false, message: "Cash record not found" });
    }
    const p = req.body;
    const updatedData = {
      title: p.title !== undefined ? p.title : existing.title,
      amount: p.amount !== undefined ? safe(p.amount) : existing.amount,
      note: p.note !== undefined ? p.note : existing.note,
      date: p.date !== undefined ? p.date : existing.date,
      time: p.time !== undefined ? p.time : existing.time,
      updatedAt: new Date()
    };
    const result = await cashListCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updatedData }
    );
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});


app.delete("/cash-list/:id", verifyToken, verifyAdmin, validateId, async (req, res) => {
  try {
    const result = await cashListCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});


// ================= RECEIVABLE API =================
// 🔒 POST/PATCH/DELETE: এডমিন অনলি
app.post("/receivables", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const data = {
      name: req.body.name,
      amount: safe(req.body.amount),
      minusAmount: safe(req.body.minusAmount || 0),
      createdAt: req.body.createdAt ? new Date(req.body.createdAt) : new Date(),
    };
    const result = await receivablesCollection.insertOne(data);
    res.send({ success: true, insertedId: result.insertedId });
  } catch (error) {
    res.status(500).send({ success: false, message: "Receivable creation failed" });
  }
});


// 🔓 GET: verifyAdmin সরানো হয়েছে
app.get("/receivables", verifyToken, async (req, res) => {
  try {
    const result = await receivablesCollection.find().sort({ createdAt: -1 }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: "Receivables fetch failed" });
  }
});


app.patch("/receivables/:id", verifyToken, verifyAdmin, validateId, async (req, res) => {
  try {
    const existing = await receivablesCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!existing) return res.status(404).send({ success: false, message: "Record not found" });
    const updatedData = {
      name: req.body.name !== undefined ? req.body.name : existing.name,
      amount: req.body.amount !== undefined ? safe(req.body.amount) : existing.amount,
      minusAmount: req.body.minusAmount !== undefined ? safe(req.body.minusAmount) : existing.minusAmount,
      createdAt: req.body.date ? new Date(req.body.date) : existing.createdAt,
      updatedAt: new Date()
    };
    const result = await receivablesCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updatedData }
    );
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});


app.delete("/receivables/:id", verifyToken, verifyAdmin, validateId, async (req, res) => {
  try {
    const result = await receivablesCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});


// ================= TRANSACTIONS (HOWLAD) API =================
// 🔒 POST/PATCH/DELETE: এডমিন অনলি ডাটা অ্যাড বা এডিট করবে
app.post("/transactions", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const p = req.body;
    const data = {
      name: p.name || "Unknown",
      amount: safe(p.amount),
      type: p.type || "loan",
      note: p.note || "",
      minusAmount: safe(p.minusAmount || 0),
      createdAt: p.createdAt ? new Date(p.createdAt) : new Date()
    };
    const result = await transactionsCollection.insertOne(data);
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});


// 🔓 GET: verifyAdmin সরানো হয়েছে (আপনার 403 এররটি এখান থেকেই আসছিল, এখন সমাধান হয়ে যাবে)
app.get("/transactions", verifyToken, async (req, res) => {
  try {
    const result = await transactionsCollection.find().sort({ createdAt: -1 }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to fetch transactions" });
  }
});


app.patch("/transactions/:id", verifyToken, verifyAdmin, validateId, async (req, res) => {
  try {
    const existing = await transactionsCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!existing) {
      return res.status(404).send({ success: false, message: "Transaction not found" });
    }
    const p = req.body;
    const updatedData = {
      name: p.name !== undefined ? p.name : existing.name,
      amount: p.amount !== undefined ? safe(p.amount) : existing.amount,
      type: p.type !== undefined ? p.type : existing.type,
      note: p.note !== undefined ? p.note : existing.note,
      minusAmount: p.minusAmount !== undefined ? safe(p.minusAmount) : existing.minusAmount,
      createdAt: p.createdAt ? new Date(p.createdAt) : existing.createdAt,
      updatedAt: new Date()
    };
    const result = await transactionsCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updatedData }
    );
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});


app.delete("/transactions/:id", verifyToken, verifyAdmin, validateId, async (req, res) => {
  try {
    const result = await transactionsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});


// ================= STAFF API =================
// 🔒 POST/PATCH/DELETE: এডমিন অনলি
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


// 🔓 GET: verifyAdmin সরানো হয়েছে যেন স্টাফ ড্যাশবোর্ডে ডাটা রেন্ডার হতে পারে
app.get("/staffs", verifyToken, async (req, res) => {
  try {
    const result = await staffCollection.find().toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: "Staff fetch failed" });
  }
});

app.get("/staffs/:id", verifyToken, validateId, async (req, res) => {
  try {
    const id = req.params.id;

    const result = await staffCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!result) {
      return res.status(404).send({
        success: false,
        message: "Staff not found",
      });
    }

    res.send(result);

  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to fetch single staff",
    });
  }
});

app.patch("/staffs/:id", verifyToken, verifyAdmin, validateId, async (req, res) => {
  try {
    const existing = await staffCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!existing) return res.status(404).send({ success: false, message: "Staff member not found" });
    const updatedData = {
      name: req.body.name || existing.name,
      role: req.body.role || existing.role,
      phone: req.body.phone || existing.phone,
      monthlySalary: req.body.monthlySalary !== undefined ? safe(req.body.monthlySalary) : existing.monthlySalary,
      salary: req.body.salary !== undefined ? safe(req.body.salary) : existing.salary,
      totalTaken: req.body.totalTaken !== undefined ? safe(req.body.totalTaken) : existing.totalTaken,
      weeklyExpenses: req.body.weeklyExpenses || existing.weeklyExpenses,
      updatedAt: new Date()
    };
    const result = await staffCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: updatedData });
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
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
// 🔒 POST/PATCH/DELETE: এডমিন অনলি
app.post("/expenses", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const p = req.body;
    const expenseData = {
      title: p.title || "Untitled Expense",
      category: p.category || "",
      amount: safe(p.amount),
      createdAt: p.createdAt ? new Date(p.createdAt) : new Date()
    };
    const result = await expensesCollection.insertOne(expenseData);
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: "Expense addition failed" });
  }
});


// 🔓 GET: verifyAdmin সরানো হয়েছে
app.get("/expenses", verifyToken, async (req, res) => {
  try {
    const result = await expensesCollection.find().sort({ createdAt: -1 }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: "Expenses fetch failed" });
  }
});


app.patch("/expenses/:id", verifyToken, verifyAdmin, validateId, async (req, res) => {
  try {
    const existing = await expensesCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!existing) {
      return res.status(404).send({ success: false, message: "Expense record not found" });
    }
    const p = req.body;
    const updatedData = {
      title: p.title !== undefined ? p.title : existing.title,
      category: p.category !== undefined ? p.category : existing.category,
      amount: p.amount !== undefined ? safe(p.amount) : existing.amount,
      createdAt: p.createdAt ? new Date(p.createdAt) : existing.createdAt,
      updatedAt: new Date()
    };
    const result = await expensesCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updatedData }
    );
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});


app.delete("/expenses/:id", verifyToken, verifyAdmin, validateId, async (req, res) => {
  try {
    const result = await expensesCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});


// ================= ANALYTICS & REPORTS API =================
// 🔓 GET: রিডিউসড ভেরিফিকেশন (রিপোর্টসগুলো যদি ইউজারদের দেখাতে চান তবে এডমিন তুলে দিতে পারেন, আপাতত এডমিন রাখা হলো কারণ এটি চার্টের মূল অ্যানালিটিক্স)
app.get("/admin-stats", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const salesColl = req.collections?.salesCollection || salesCollection;
    const result = await salesColl.aggregate([
      { $group: { _id: "$productName", quantity: { $sum: "$quantity" }, revenue: { $sum: "$revenue" } } }
    ]).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});


app.get("/report/monthly", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const reportsColl = req.collections?.reportsCollection || reportsCollection;
    const result = await reportsColl.find().toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to fetch monthly reports" });
  }
});


app.post("/report/monthly/save", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const salesColl = req.collections?.salesCollection || salesCollection;
    const expensesColl = req.collections?.expensesCollection || expensesCollection;
    const reportsColl = req.collections?.reportsCollection || reportsCollection;


    const sales = await salesColl.find().toArray();
    const expenses = await expensesColl.find().toArray();
    const monthly = {};


    sales.forEach((s) => {
      const dateObj = s.createdAt ? new Date(s.createdAt) : new Date();
      const month = dateObj.toLocaleString("default", { month: "long" });
      if (!monthly[month]) {
        monthly[month] = { month, revenue: 0, expense: 0 };
      }
      monthly[month].revenue += safe(s.revenue || (s.sellPrice * s.quantity));
    });


    expenses.forEach((e) => {
      const dateObj = e.createdAt ? new Date(e.createdAt) : new Date();
      const month = dateObj.toLocaleString("default", { month: "long" });
      if (!monthly[month]) {
        monthly[month] = { month, revenue: 0, expense: 0 };
      }
      monthly[month].expense += safe(e.amount);
    });


    const finalData = Object.values(monthly);
    await reportsColl.deleteMany({});
    if (finalData.length > 0) {
      await reportsColl.insertMany(finalData);
    }
    res.send({ success: true, message: "Monthly report synced and saved successfully!", data: finalData });
  } catch (error) {
    console.error("Save report error:", error);
    res.status(500).send({ success: false, message: "Save failed", error: error.message });
  }
});


// 🔓 GET: ক্যাশ টোটাল এপিআই থেকে verifyAdmin সরানো হয়েছে
app.get("/cash-total", verifyToken, async (req, res) => {
  try {
    const cashColl = req.collections?.cashListCollection || cashListCollection;
    const cash = await cashColl.find().toArray();
    const total = cash.reduce((sum, c) => sum + safe(c.amount), 0);
    res.send({ success: true, total });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to fetch cash total", error: error.message });
  }
});


// ================= DASHBOARD ROUTE =================
app.get("/dashboard", verifyToken, async (req, res) => {
  try {

    const salesData = await salesCollection.find().toArray();

    const expenses = await expensesCollection.find().toArray();

    const staff = await staffCollection.find().toArray();

    const products = await productsCollection.find().toArray();

    const cashList = await cashListCollection.find().toArray();

    const profits = await profitsCollection.find().toArray();

    const receivablesData = await receivablesCollection.find().toArray();

    // ================= SALES =================
    let totalSales = 0;

    let totalProfit = 0;

    salesData.forEach((s) => {

      totalSales += Number(s?.revenue || 0);

      totalProfit += Number(s?.profit || 0);

    });

    // ================= MANUAL PROFITS =================
    const manualProfit = profits.reduce(
      (sum, item) => sum + Number(item?.amount || 0),
      0
    );

    // FINAL PROFIT
    totalProfit += manualProfit;

    // ================= EXPENSES =================
    const totalExpenseAmount = expenses.reduce(
      (sum, i) => sum + Number(i?.amount || 0),
      0
    );

    // ================= STAFF SALARY =================
    const totalStaffSalary = staff.reduce(
      (sum, i) =>
        sum + Number(i?.monthlySalary || i?.salary || 0),
      0
    );

    // ================= CASH LIST =================
    const totalCashFromList = cashList.reduce(
      (sum, i) => sum + Number(i?.amount || 0),
      0
    );

    // ================= RECEIVABLES =================
    let totalTransactionPlus = 0;

    let totalTransactionMinus = 0;

    receivablesData.forEach((t) => {

      const amount = Number(t?.amount || 0);

      if (amount > 0) {

        totalTransactionPlus += amount;

      } else if (amount < 0) {

        totalTransactionMinus += amount;

      }

    });

    // ================= CASH IN =================
    const totalCashCombined =
      totalSales +
      totalCashFromList +
      totalTransactionPlus +
      manualProfit;

    // ================= CASH OUT =================
    const totalExpenseCombined =
      totalExpenseAmount +
      totalStaffSalary +
      Math.abs(totalTransactionMinus);

    // ================= FINAL CASH =================
    const netBusinessCash =
      totalCashCombined - totalExpenseCombined;

    // ================= STOCK =================
    const totalStock = products.reduce(
      (sum, i) => sum + Number(i?.stock || 0),
      0
    );

    const totalStockValue = products.reduce(
      (sum, i) =>
        sum +
        (Number(i?.stock || 0) *
          Number(i?.buyPrice || 0)),
      0
    );

    // ================= RESPONSE =================
    res.send({
      totalSales,
      totalProfit,
      manualProfit,
      totalExpenseAmount,
      totalStaffSalary,
      totalCashFromList,
      totalTransactionPlus,
      totalTransactionMinus,
      totalCashCombined,
      totalExpenseCombined,
      netBusinessCash,
      totalStock,
      totalStockValue,
    });

  } catch (error) {

    console.log("DASHBOARD ERROR:", error);

    res.status(500).send({
      success: false,
      message: error.message,
    });

  }
});

// Global Error Handler for Vercel Serverless Scope
app.use((err, req, res, next) => {
  console.error("🚨 Global Server Error:", err.stack);
  res.status(500).send({ success: false, message: "Something broke internally!" });
});


// Local listening
if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => {
    console.log(`🚀 Server is listening dynamically on port ${port}`);
  });
}


module.exports = app;