const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const port = process.env.PORT || 5000;

// middleware
// example
app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:5000"
  ],
  credentials: true
}));
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
// Mongo URI
const uri = `mongodb://shopDb:${process.env.DB_PASS}@ac-kckblav-shard-00-00.rd6jhgv.mongodb.net:27017,ac-kckblav-shard-00-01.rd6jhgv.mongodb.net:27017,ac-kckblav-shard-00-02.rd6jhgv.mongodb.net:27017/shopDb?ssl=true&replicaSet=atlas-l06qfj-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
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

        req.decoded = decoded;
        next();
      });
    };

    // =====================
    // JWT ROUTE (ONLY ONE)
    // =====================
    app.post("/jwt", (req, res) => {
      const user = req.body;

      if (!user?.email) {
        return res.status(400).send({ message: "Email required" });
      }

      const token = jwt.sign(
        { email: user.email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "1h" }
      );

      res.send({ token });
    });

    // use verify admin after verifyToken
    const verifyAdmin = async (req, res, next) => {
      try {
        const email = req.decoded?.email;

        if (!email) {
          return res.status(403).send({ message: "Forbidden" });
        }

        const user = await usersCollection.findOne({ email });

        if (user?.role !== "admin") {
          return res.status(403).send({ message: "Forbidden access" });
        }

        next();
      } catch (err) {
        res.status(500).send({ message: "Server error" });
      }
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

      const result = await cartsCollection.find({ email }).toArray();
      res.send(result);
    });

    app.post("/carts", async (req, res) => {
      const result = await cartsCollection.insertOne(req.body);
      res.send(result);
    });

    app.delete("/carts/:id", async (req, res) => {
      const result = await cartsCollection.deleteOne({
        _id: new ObjectId(req.params.id)
      });

      res.send(result);
    });

    // ================= PRODUCTS =================
    // ================= ADD PRODUCT =================
    app.post('/products', async (req, res) => {
      const p = req.body;

      const product = {
        name: p.name,
        karat: p.karat,
        image: p.image, // ✅ ADD THIS LINE
        buyPrice: Number(p.buyPrice),
        sellPrice: Number(p.sellPrice || 0),
        stock: Number(p.stock || 0),
        vori: Number(p.vori || 0),
        ana: Number(p.ana || 0),
        rati: Number(p.rati || 0),
        point: Number(p.point || 0),
        createdAt: new Date()
      };

      const result = await productsCollection.insertOne(product);
      res.send(result);
    });

    // ================= GET ALL PRODUCTS =================
    app.get("/products", async (req, res) => {
      const result = await productsCollection
        .find()
        .sort({ createdAt: -1 })
        .toArray();

      res.send(result);
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
          name: req.body.name,
          sellPrice: Number(req.body.sellPrice || 0),

          vori: Number(req.body.vori || 0),
          ana: Number(req.body.ana || 0),
          rati: Number(req.body.rati || 0),
          point: Number(req.body.point || 0),

          stock: Number(req.body.stock || 0),
        };

        // ✅ safe date handling
        if (req.body.createdAt) {
          const date = new Date(req.body.createdAt);
          if (!isNaN(date)) {
            updated.createdAt = date;
          }
        }

        const result = await productsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updated }
        );

        res.send(result);

      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Update failed" });
      }
    });


    // ================= DELETE PRODUCT =================
    app.delete('/products/:id', async (req, res) => {
      try {
        const result = await productsCollection.deleteOne({
          _id: new ObjectId(req.params.id)
        });

        res.send(result);

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
    // CREATE SALE
    app.post("/sales", async (req, res) => {
      try {
        const { productId, quantity, sellPrice } = req.body;

        // ✅ validation
        if (!productId || !quantity || !sellPrice) {
          return res.status(400).send({ message: "Missing fields" });
        }

        const product = await productsCollection.findOne({
          _id: new ObjectId(productId),
        });

        if (!product) {
          return res.status(404).send({ message: "Product not found" });
        }

        const qty = Number(quantity);
        const price = Number(sellPrice);

        // ❌ stock check remove (as you said)
        // if (product.stock < qty) {
        //   return res.status(400).send({ message: "Not enough stock" });
        // }

        const revenue = price * qty;
        const cost = Number(product.buyPrice || 0) * qty;
        const profit = revenue - cost;

        const saleDoc = {
          productId: product._id.toString(),
          productName: product.name,
          image: product.image || "",
          quantity: qty,
          sellPrice: price,
          buyPrice: product.buyPrice || 0,
          revenue,
          cost,
          profit,
          createdAt: new Date(),
        };

        const result = await salesCollection.insertOne(saleDoc);

        res.send({
          success: true,
          sale: saleDoc,
          result,
        });

      } catch (err) {
        console.log("SALE ERROR:", err);
        res.status(500).send({ message: err.message });
      }
    });

    app.get("/sales", async (req, res) => {
      const result = await salesCollection.find().toArray();
      res.send(result);
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

    // ================= MONTHLY REPORT (FIXED) =================
    app.get("/report/monthly", verifyToken, async (req, res) => {
      const sales = await salesCollection.find().toArray();

      const monthly = {};

      sales.forEach((s) => {
        const date = new Date(s.createdAt || new Date());
        const key = `${date.getFullYear()}-${date.getMonth() + 1}`;

        if (!monthly[key]) {
          monthly[key] = { month: key, totalSales: 0, profit: 0 };
        }

        monthly[key].totalSales += s.revenue || 0;
        monthly[key].profit += s.profit || 0;
      });

      res.send(Object.values(monthly));
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
    // ➕ ADD
    app.post("/receivables", async (req, res) => {
      try {
        const data = {
          name: req.body.name,
          amount: Number(req.body.amount),

          // ✅ date fix
          createdAt: req.body.date
            ? new Date(req.body.date)
            : new Date(),

          updatedAt: null,
        };

        const result = await receivablesCollection.insertOne(data);

        res.send({
          success: true,
          insertedId: result.insertedId,
        });

      } catch (err) {
        res.status(500).send({ message: "Insert failed" });
      }
    });

    // 📥 GET
    app.get("/receivables", async (req, res) => {
      const result = await receivablesCollection
        .find()
        .sort({ createdAt: -1 }) // 🔥 latest first
        .toArray();

      res.send(result);
    });

    // ✏️ UPDATE (edit সহ date update)
    app.patch("/receivables/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const updatedData = {
          name: req.body.name,
          amount: Number(req.body.amount),

          // ✅ edit করলে date update হবে
          createdAt: req.body.date
            ? new Date(req.body.date)
            : undefined,

          updatedAt: new Date(),
        };

        const result = await receivablesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );

        res.send({
          success: true,

        });

      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Update failed" });
      }
    });

    // 🗑 DELETE
    app.delete("/receivables/:id", async (req, res) => {
      const result = await receivablesCollection.deleteOne({
        _id: new ObjectId(req.params.id),
      });

      res.send({ success: true });
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
    app.post("/cash", async (req, res) => {
      const amount = Number(req.body.amount || 0);
      const existing = await cashCollection.findOne();
      if (existing) {
        const result = await cashCollection.updateOne(
          { _id: existing._id },
          { $inc: { amount } }
        );
        res.send(result);
      }
      else {
        const result = await cashCollection.insertOne({ amount });
        res.send(result);
      }
    });

    // ================= DASHBOARD =================
    app.get("/dashboard", verifyToken, async (req, res) => {
      try {
        const salesData = await salesCollection.find().toArray();
        const expenses = await expensesCollection.find().toArray();
        const staff = await staffCollection.find().toArray();
        const receivables = await receivablesCollection.find().toArray();
        const products = await productsCollection.find().toArray();

        // SALES
        let totalSales = 0;
        let totalProfit = 0;
        let totalLoss = 0;

        salesData.forEach((s) => {
          const qty = Number(s.quantity || 1);
          const sell = Number(s.sellPrice || 0);
          const buy = Number(s.buyPrice || 0);

          const revenue = sell * qty;
          const cost = buy * qty;

          totalSales += revenue;

          const profit = revenue - cost;

          if (profit >= 0) totalProfit += profit;
          else totalLoss += Math.abs(profit);
        });

        // EXPENSE
        const totalExpense = expenses.reduce(
          (sum, item) => sum + Number(item.amount || 0),
          0
        );

        // STAFF
        const totalStaffSalary = staff.reduce(
          (sum, item) => sum + Number(item.salary || item.totalTaken || 0),
          0
        );

        // RECEIVABLE
        const totalReceivable = receivables.reduce(
          (sum, item) => sum + Number(item.amount || 0),
          0
        );

        // STOCK
        const totalStock = products.reduce(
          (sum, item) => sum + Number(item.stock || 0),
          0
        );

        // CASH
        const totalCash =
          totalProfit -
          totalLoss -
          totalExpense -
          totalStaffSalary -
          totalReceivable;

        res.send({
          totalSales,
          totalProfit,
          totalLoss,
          totalExpense,
          totalStaffSalary,
          totalReceivable,
          totalStock,
          totalCash,
        });

      } catch (error) {
        console.log("DASHBOARD ERROR:", error);
        res.status(500).send({ message: "Dashboard data failed" });
      }
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('laivin is sitting')
})

app.listen(port, () => {
  console.log(`Laivin boss is sitting on port ${port}`);
})
