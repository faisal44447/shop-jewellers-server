const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());


// Mongo URI
const uri = `mongodb://shopDb:${process.env.DB_PASS}@ac-kckblav-shard-00-00.rd6jhgv.mongodb.net:27017,ac-kckblav-shard-00-01.rd6jhgv.mongodb.net:27017,ac-kckblav-shard-00-02.rd6jhgv.mongodb.net:27017/shopDb?ssl=true&replicaSet=atlas-l06qfj-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});


async function run() {
  try {
    await client.connect();
    console.log("MongoDB connected successfully");

    const productsCollection = client.db("shopDb").collection("products");
    const usersCollection = client.db("shopDb").collection("users");
    const cartsCollection = client.db("shopDb").collection("carts");
    const salesCollection = client.db("shopDb").collection("sales");
    const expensesCollection = client.db("shopDb").collection("expenses");
    const receivablesCollection = client.db("shopDb").collection("receivables");
    const transactionsCollection = client.db("shopDb").collection("transactions");
    const cashCollection = client.db("shopDb").collection("cash");
    const staffCollection = client.db("shopDb").collection("staffs");
    const profitsCollection = client.db("shopDb").collection("profits");

    const verifyToken = (req, res, next) => {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        return res.status(401).send({ message: "Unauthorized" });
      }

      const token = authHeader.split(" ")[1];

      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(403).send({ message: "Forbidden" });
        }

        req.decoded = decoded; // 🔥 IMPORTANT FIX
        next();
      });
    };

    // ============================
    // 🔑 JWT
    // ============================
    app.post('/jwt', (req, res) => {
      const user = req.body;

      const token = jwt.sign(
        { email: user.email }, // only necessary data
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: '1h' }
      );

      res.send({ token });
    });
    // use verify admin after verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;

      const user = await usersCollection.findOne({ email });

      if (user?.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }

      next();
    };

    // ================= USERS =================
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.get('/users/admin/:email', async (req, res) => {
      const email = req.params.email;

      const user = await usersCollection.findOne({ email });

      res.send({
        admin: user?.role === 'admin'
      });
    });

    app.post('/users', async (req, res) => {
      try {
        const user = req.body;
        console.log(user);

        const existing = await usersCollection.findOne({ email: user.email });

        if (existing) {
          return res.send({ message: "User already exists" });
        }

        const result = await usersCollection.insertOne(user);
        res.send({ success: true, result });

      } catch (err) {
        console.log("USER INSERT ERROR:", err);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: 'admin'
        }
      }
      const result = await usersCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })

    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    })

    app.get("/admin-only", verifyToken, verifyAdmin, (req, res) => {
      res.send({ secret: "admin data" });
    });

    app.get("/admin-stats", async (req, res) => {
      try {
        const result = await salesCollection.aggregate([
          {
            $group: {
              _id: "$productName",
              quantity: { $sum: 1 },
              revenue: { $sum: "$total" }
            }
          }
        ]).toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Server error" });
      }
    });

    // ================= CARTS =================
    app.get("/carts", verifyToken, async (req, res) => {
      const email = req.query.email;

      if (!email) {
        return res.status(400).send({ message: "Email required" });
      }

      const result = await cartsCollection.find({ email }).toArray();
      res.send(result);
    });

    app.post("/carts", async (req, res) => {
      const result = await cartsCollection.insertOne(req.body);
      res.send(result);
    });

    app.delete("/carts/:id", async (req, res) => {
      const result = await cartsCollection.deleteOne({
        _id: new ObjectId(req.params.id),
      });
      res.send(result);
    });

    // ================= PRODUCTS =================
    // ================= ADD PRODUCT =================
    app.post('/products', async (req, res) => {
      try {
        const p = req.body;

        // ✅ VALIDATION
        if (!p.name || !p.karat || !p.buyPrice) {
          return res.status(400).send({ message: "Missing required fields" });
        }

        const newProduct = {
          name: p.name,
          karat: p.karat,
          vori: Number(p.vori || 0),
          ana: Number(p.ana || 0),
          rati: Number(p.rati || 0),
          point: Number(p.point || 0),
          buyPrice: Number(p.buyPrice),
          sellPrice: 0,

          stock: 1, // 🔥 IMPORTANT (আগে ছিল না)
          status: "stock",

          image: p.image || "",
          createdAt: p.createdAt || new Date()
        };

        const result = await productsCollection.insertOne(newProduct);

        res.send({ success: true, result });

      } catch (error) {
        console.log("ADD PRODUCT ERROR:", error);
        res.status(500).send({ message: "Server error" });
      }
    });


    // ================= GET ALL PRODUCTS =================
    app.get('/products', async (req, res) => {
      try {
        const result = await productsCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Server error" });
      }
    });


    // ================= GET SINGLE PRODUCT =================
    app.get('/products/:id', async (req, res) => {
      try {
        const product = await productsCollection.findOne({
          _id: new ObjectId(req.params.id)
        });

        if (!product) {
          return res.status(404).send({ message: "Product not found" });
        }

        res.send(product);

      } catch (error) {
        res.status(500).send({ message: "Invalid ID" });
      }
    });


    // ================= UPDATE PRODUCT =================
    app.patch('/products/:id', async (req, res) => {
      try {
        const id = req.params.id;

        const updated = {
          ...req.body,
          vori: Number(req.body.vori || 0),
          ana: Number(req.body.ana || 0),
          rati: Number(req.body.rati || 0),
          point: Number(req.body.point || 0),
          buyPrice: Number(req.body.buyPrice || 0),
          sellPrice: Number(req.body.sellPrice || 0)
        };

        const result = await productsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updated }
        );

        res.send(result);

      } catch (error) {
        res.status(500).send({ message: "Update failed" });
      }
    });


    // ================= DELETE PRODUCT =================
    app.delete('/products/:id', async (req, res) => {
      try {
        const result = await productsCollection.deleteOne({
          _id: new ObjectId(req.params.id)
        });

        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "Product not found" });
        }

        res.send({ success: true });

      } catch (error) {
        res.status(500).send({ message: "Delete failed" });
      }
    });

    app.get("/products/low-stock", async (req, res) => {
      try {
        const products = await productsCollection.find().toArray();

        const lowStock = products.filter(p => (p.stock || 0) <= 5);

        res.send(lowStock);
      } catch (err) {
        res.status(500).send({ message: "Failed" });
      }
    });

    //================= Profits=========================
    // ➕ ADD PROFIT
    app.post("/profits", async (req, res) => {
      try {
        const data = {
          note: req.body.note || "",
          amount: Number(req.body.amount),
          createdAt: new Date() // 🔥 always safe
        };

        const result = await profitsCollection.insertOne(data);

        res.send({
          success: true,
          insertedId: result.insertedId,
        });

      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message
        });
      }
    });

    // 📥 GET PROFITS
    app.get("/profits", async (req, res) => {
      const result = await profitsCollection.find().toArray();
      res.send(result);
    });

    // 🗑 DELETE PROFIT
    app.delete("/profits/:id", async (req, res) => {
      const id = req.params.id;

      const result = await profitsCollection.deleteOne({
        _id: new ObjectId(id),
      });

      res.send({
        success: result.deletedCount > 0,
      });
    });

    // ✏️ UPDATE PROFIT
    app.patch("/profits/:id", async (req, res) => {
      const id = req.params.id;

      const updateDoc = {
        $set: {
          note: req.body.note,
          amount: Number(req.body.amount),
        },
      };

      const result = await profitsCollection.updateOne(
        { _id: new ObjectId(id) },
        updateDoc
      );

      res.send({
        success: result.modifiedCount > 0,
      });
    });

    // ================= SALES =================
    app.post("/sell", async (req, res) => {
      try {
        const item = req.body;

        const qty = Number(item.quantity || 1);

        const product = await productsCollection.findOne({
          _id: new ObjectId(item._id)
        });

        if (!product) {
          return res.status(404).send({ message: "Product not found" });
        }

        if (product.stock < qty) {
          return res.status(400).send({ message: "Not enough stock" });
        }

        const buyPrice = Number(product.buyPrice);
        const sellPrice = Number(item.sellPrice);
        const profit = (sellPrice - buyPrice) * qty;

        await salesCollection.insertOne({
          ...item,
          total: sellPrice * qty,
          profit,
          createdAt: new Date()
        });

        await productsCollection.updateOne(
          { _id: new ObjectId(item._id) },
          {
            $inc: { stock: -qty },
            $set: {
              status: product.stock - qty === 0 ? "sold" : "stock"
            }
          }
        );

        res.send({ success: true });

      } catch (err) {
        res.status(500).send({ message: "Sell failed" });
      }
    });

    app.get("/sales", async (req, res) => {
      try {
        const result = await salesCollection.find().toArray();
        res.send(result);
      } catch (err) {
        console.log("Sales Error:", err);
        res.status(500).send({ message: "Failed to load sales" });
      }
    });

    app.delete("/sales/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;

      await salesCollection.deleteOne({
        _id: new ObjectId(id)
      });

      res.send({ success: true });
    });

    // ========= Deily sales ===========
    app.get("/analytics/daily", async (req, res) => {
      try {
        const sales = await salesCollection.find().toArray();

        const days = {};

        sales.forEach(s => {
          const date = new Date(s.createdAt).toISOString().split("T")[0];

          if (!days[date]) {
            days[date] = {
              date,
              totalSales: 0,
              profit: 0,
              count: 0,
            };
          }

          days[date].totalSales += Number(s.total || 0);
          days[date].profit += Number(s.profit || 0);
          days[date].count += 1;
        });

        res.send(Object.values(days));

      } catch (err) {
        res.status(500).send({ message: "Analytics failed" });
      }
    });

    // ================= STAFF =================
    app.post("/staffs", async (req, res) => {
      const result = await staffCollection.insertOne(req.body);
      res.send(result);
    });

    app.get("/staffs", async (req, res) => {
      const result = await staffCollection.find().toArray();
      res.send(result);
    });

    // GET single staff
    app.get("/staffs/:id", async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({
            success: false,
            message: "Invalid staff ID"
          });
        }

        const staff = await staffCollection.findOne({   // ✅ FIXED
          _id: new ObjectId(id),
        });

        if (!staff) {
          return res.status(404).send({
            success: false,
            message: "Staff not found"
          });
        }

        res.send(staff);

      } catch (error) {
        console.error("GET STAFF ERROR:", error);
        res.status(500).send({
          success: false,
          message: error.message
        });
      }
    });

    app.put("/staffs/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid ID" });
        }

        // ✅ FIX: remove strict month requirement OR handle properly
        if (!updatedData.name || updatedData.monthlySalary == null) {
          return res.status(400).send({ message: "Missing required fields" });
        }

        const result = await staffCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );

        res.send(result);

      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    app.patch("/staffs/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await staffCollection.updateOne(   // ✅ FIXED
          { _id: new ObjectId(id) },
          { $set: req.body }
        );

        res.send(result);

      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    app.delete("/staffs/:id", async (req, res) => {
      const id = req.params.id;

      const result = await staffCollection.deleteOne({ _id: new ObjectId(id) });

      res.send(result);
    });

    // ================= EXPENSE =================
    app.post("/expenses", async (req, res) => {
      const result = await expensesCollection.insertOne({
        ...req.body,
        createdAt: new Date(),
      });
      res.send(result);
    });

    app.get("/expenses", async (req, res) => {
      const result = await expensesCollection.find().toArray();
      res.send(result);
    });

    // ================= RECEIVABLE =================
    app.post("/receivables", async (req, res) => {
      const result = await receivablesCollection.insertOne(req.body);
      res.send(result);
    });

    app.get("/receivables", async (req, res) => {
      const result = await receivablesCollection.find().toArray();
      res.send(result);
    });

    app.patch("/receivables/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const updatedData = {
          name: req.body.name,
          amount: Number(req.body.amount || 0),
          updatedAt: new Date()
        };

        const result = await receivablesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );

        res.send({
          success: true,
          modifiedCount: result.modifiedCount
        });

      } catch (err) {
        console.log(err);
        res.status(500).send({ message: "Update failed" });
      }
    });

    app.delete("/receivables/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await receivablesCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "Receivable not found" });
        }

        res.send({ success: true, message: "Deleted successfully" });

      } catch (err) {
        res.status(500).send({ message: "Server error" });
      }
    });


    // ================= TRANSACTIONS =================
    app.post("/transactions", async (req, res) => {
      const result = await transactionsCollection.insertOne({
        ...req.body,
        createdAt: new Date(),
      });
      res.send(result);
    });

    app.get("/transactions", async (req, res) => {
      const result = await transactionsCollection.find().toArray();
      res.send(result);
    });

    // ================= CASH =================
    app.get("/cash", async (req, res) => {
      const cash = await cashCollection.findOne();
      res.send(cash || { amount: 0 });
    });

    // ===== InVoice =====
    app.get("/invoice/:id", async (req, res) => {
      const sale = await salesCollection.findOne({
        _id: new ObjectId(req.params.id)
      });

      res.send(sale);
    });

    // ================= DASHBOARD =================
    app.get("/dashboard", async (req, res) => {
      const p = await productsCollection.find().toArray();
      const s = await salesCollection.find().toArray();
      const e = await expensesCollection.find().toArray();
      const r = await receivablesCollection.find().toArray();
      const t = await transactionsCollection.find().toArray();
      const cash = await cashCollection.findOne();
      const profits = await profitsCollection.find().toArray(); // ✅ ADD

      const totalStock = p.length;
      const totalSales = s.reduce((a, b) => a + (b.total || 0), 0);
      const totalExpense = e.reduce((a, b) => a + (b.amount || 0), 0);
      const totalReceivable = r.reduce((a, b) => a + (b.amount || 0), 0);

      const totalProfit = profits.reduce((a, b) => a + (b.amount || 0), 0); // ✅ ADD

      const totalLoan = t
        .filter((i) => i.type === "loan")
        .reduce((a, b) => a + (b.amount || 0), 0);

      const totalGiven = t
        .filter((i) => i.type === "given")
        .reduce((a, b) => a + (b.amount || 0), 0);

      res.send({
        totalStock,
        totalSales,
        totalExpense,
        totalReceivable,
        cash: cash?.amount || 0,

        profit: totalProfit, // 🔥 NOW REAL PROFIT FROM COLLECTION

        takaPabo: totalReceivable,
        howladNise: totalLoan,
        howladDise: totalGiven,
        time: new Date(),
      });
    });

    app.get("/report/monthly", async (req, res) => {
      try {
        const sales = await salesCollection.find().toArray();
        const expenses = await expensesCollection.find().toArray(); // ✅ FIX (আগে ভুল ছিল)

        const months = {};

        sales.forEach(s => {
          const m = new Date(s.createdAt).getMonth(); // ✅ FIX
          months[m] = months[m] || { month: m, sales: 0, expense: 0 };
          months[m].sales += s.total || 0;
        });

        expenses.forEach(e => {
          const m = new Date(e.createdAt).getMonth(); // ✅ FIX
          months[m] = months[m] || { month: m, sales: 0, expense: 0 };
          months[m].expense += e.amount || 0;
        });

        res.send(Object.values(months));

      } catch (error) {
        console.log("Monthly Report Error:", error);
        res.status(500).send({ message: "Monthly report failed" });
      }
    });

    app.get("/dashboard/summary", async (req, res) => {
      try {
        const sales = await salesCollection.find().toArray();
        const expenses = await expensesCollection.find().toArray();
        const staffs = await staffCollection.find().toArray();

        const revenue = sales.reduce((sum, s) => sum + (Number(s.total) || 0), 0);

        const expense = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

        const staffExpense = staffs.reduce((sum, s) => sum + (Number(s.monthlySalary) || 0), 0);

        // 🔥 REAL PROFIT (no separate collection needed)
        const profit = sales.reduce((sum, s) => sum + (Number(s.profit) || 0), 0);

        res.send({
          revenue,
          expense: expense + staffExpense,
          profit,
          loss: profit < 0 ? Math.abs(profit) : 0,
        });

      } catch (err) {
        res.status(500).send({ message: "Dashboard error" });
      }
    });

    // health check
    app.get('/', (req, res) => {
      res.send('Server is running');
    });

  } catch (error) {
    console.log("MongoDB connection error:", error);
  }
}

run().catch(console.dir);

// server start
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});