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
const uri = `mongodb://shopDb:${process.env.DB_PASS}@ac-kckblav-shard-00-00.rd6jhgv.mongodb.net:27017,ac-kckblav-shard-00-01.rd6jhgv.mongodb.net:27017,ac-kckblav-shard-00-02.rd6jhgv.mongodb.net:27017/shopDB?ssl=true&replicaSet=atlas-l06qfj-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// ================= JWT VERIFY =================
const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized access" });
    }

    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    await client.connect();
    console.log("MongoDB connected successfully");

    const productsCollection = client.db("shopDB").collection("products");
    const cartCollection = client.db("shopDB").collection("carts");
    const usersCollection = client.db("shopDB").collection("users");

    // ================= JWT CREATE =================
    app.post('/jwt', (req, res) => {
      const user = req.body;

      const token = jwt.sign(
        { email: user.email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: '7d' }
      );

      res.send({ token });
    });

    // ================= USERS =================
    app.post('/users', async (req, res) => {
      try {
        const user = req.body;

        const exists = await usersCollection.findOne({ email: user.email });

        if (exists) {
          return res.send({ message: "user already exists" });
        }

        const result = await usersCollection.insertOne(user);

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "server error" });
      }
    });

    app.get('/users', verifyJWT, async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    // ================= ADMIN CHECK =================
    app.get('/users/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        return res.send({ admin: false });
      }

      const user = await usersCollection.findOne({ email });

      res.send({ admin: user?.role === "admin" });
    });

    // ================= MAKE ADMIN =================
    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;

      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role: "admin" } }
      );

      res.send(result);
    });

    // ================= CARTS =================
    app.get('/carts', async (req, res) => {
      try {
        const email = req.query.email;

        if (!email) {
          return res.status(400).send({ message: "Email required" });
        }

        const carts = await cartCollection.find({ email }).toArray();

        res.send(carts);
      } catch (error) {
        res.status(500).send({ message: "Server error" });
      }
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

    app.get('/products', verifyJWT, async (req, res) => {
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