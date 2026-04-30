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
    app.post('/products', async (req, res) => {
      const p = req.body;

      const result = await productsCollection.insertOne({
        name: p.name,
        karat: p.karat,
        vori: Number(p.vori || 0),
        ana: Number(p.ana || 0),
        rati: Number(p.rati || 0),
        point: Number(p.point || 0),
        buyPrice: Number(p.buyPrice || 0),
        sellPrice: 0,
        status: "stock",
        image: p.image || "",
        createdAt: new Date()
      });

      res.send({ success: true, result });
    });

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

    app.get('/products/:id', async (req, res) => {
      const product = await productsCollection.findOne({
        _id: new ObjectId(req.params.id)
      });

      if (!product) {
        return res.status(404).send({ message: "Product not found" });
      }

      res.send(product);
    });

    app.patch('/products/:id', async (req, res) => {
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

      if (result.matchedCount === 0) {
        return res.status(404).send({ message: "Product not found" });
      }

      res.send({ success: true });
    });

    app.delete('/products/:id', async (req, res) => {
      const result = await productsCollection.deleteOne({
        _id: new ObjectId(req.params.id)
      });

      if (result.deletedCount === 0) {
        return res.status(404).send({ message: "Product not found" });
      }

      res.send({ message: "Deleted successfully" });
    });

    // Profits=========================

    app.post("/profits", async (req, res) => {
      const result = await profitsCollection.insertOne({
        ...req.body,
        createdAt: new Date()
      });

      res.send({ success: true, result });
    });

    // GET PROFITS
    app.get("/profits", async (req, res) => {
      const result = await profitsCollection.find().toArray();
      res.send(result);
    });

    app.delete("/profits/:id", async (req, res) => {
      const id = req.params.id;

      const result = await profitsCollection.deleteOne({
        _id: new ObjectId(id),
      });

      res.send(result);
    });

    // ================= SALES =================
    app.post("/sell", async (req, res) => {
      try {
        const item = req.body;

        const existing = await salesCollection.findOne({
          productId: item._id
        });

        if (existing) {
          return res.send({ message: "Already sold" });
        }

        const buyPrice = Number(item.buyPrice || 0);
        const sellPrice = Number(item.sellPrice || 0);
        const profit = sellPrice - buyPrice;

        await salesCollection.insertOne({
          ...item,
          productId: item._id, // 🔥 important
          total: sellPrice,
          profit,
          status: "sold",
          createdAt: new Date()
        });

        await profitsCollection.insertOne({
          title: item.name,
          amount: profit,
          createdAt: new Date()
        });

        await productsCollection.updateOne(
          { _id: new ObjectId(item._id) },
          { $set: { status: "sold" } }
        );

        res.send({ success: true });

      } catch (err) {
        res.status(500).send({ message: "Sell failed" });
      }
    });

    app.get("/sales", async (req, res) => {
      const result = await salesCollection.find().toArray();
      res.send(result);
    });

    app.delete("/sales/:id", async (req, res) => {
      const id = req.params.id;

      await salesCollection.deleteOne({
        _id: new ObjectId(id)
      });

      res.send({ success: true });
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

    app.put("/staffs/:id", async (req, res) => {
      const result = await staffCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: req.body }
      );
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