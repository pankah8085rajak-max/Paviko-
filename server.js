const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const twilio = require("twilio");
const Razorpay = require("razorpay");
const crypto = require("crypto");
require("dotenv").config();

const app = express();

app.use(cors({
  origin: [
    "https://paviko.onrender.com",
    "http://localhost:3000"
  ],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===============================
// DATABASE
// ===============================

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.error("MongoDB Error:", err.message));

// ===============================
// USER
// ===============================

const UserSchema = new mongoose.Schema({
  mobile: { type: String, unique: true, required: true },
  name: String,
  role: {
    type: String,
    enum: ["customer", "worker", "admin"],
    default: "customer"
  },
  city: String,
  area: String,
  address: String,
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", UserSchema);

// ===============================
// WORKER
// ===============================

const WorkerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  name: String,
  mobile: String,
  service: String,
  subSkill: String,
  city: String,
  area: String,
  experience: Number,
  fee: Number,
  about: String,

  availability: {
    type: String,
    default: "Available"
  },

  status: {
    type: String,
    default: "Pending Verification"
  },

  media: [{
    url: String,
    kind: {
      type: String,
      enum: ["image", "video"]
    }
  }],

  rating: {
    type: Number,
    default: 0
  },

  totalReviews: {
    type: Number,
    default: 0
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Worker = mongoose.model("Worker", WorkerSchema);

// ===============================
// BOOKING
// ===============================

const BookingSchema = new mongoose.Schema({
  bookingId: {
    type: String,
    unique: true
  },

  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },

  workerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Worker"
  },

  customerName: String,
  customerMobile: String,
  service: String,
  date: String,
  time: String,
  address: String,
  details: String,

  status: {
    type: String,
    enum: [
      "Booking Request Sent",
      "Accepted",
      "Rejected",
      "Completed",
      "Cancelled"
    ],
    default: "Booking Request Sent"
  },

  amount: Number,

  paymentStatus: {
    type: String,
    enum: ["Pending", "Paid", "Failed"],
    default: "Pending"
  },

  paymentId: String,

  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Booking = mongoose.model("Booking", BookingSchema);

// ===============================
// PAYMENT
// ===============================

const PaymentSchema = new mongoose.Schema({
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Booking"
  },

  orderId: String,
  paymentId: String,
  amount: Number,
  feePercent: Number,
  pavikoFee: Number,
  workerAmount: Number,

  status: {
    type: String,
    enum: ["Pending", "Paid", "Failed"],
    default: "Pending"
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Payment = mongoose.model("Payment", PaymentSchema);

// ===============================
// REVIEW
// ===============================

const ReviewSchema = new mongoose.Schema({
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Booking"
  },

  workerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Worker"
  },

  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },

  rating: {
    type: Number,
    min: 1,
    max: 5
  },

  review: String,

  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Review = mongoose.model("Review", ReviewSchema);

// ===============================
// SPONSOR
// ===============================

const SponsorSchema = new mongoose.Schema({
  businessName: String,
  category: String,
  mobile: String,
  city: String,
  area: String,
  description: String,
  products: String,
  facilities: String,
  hours: String,

  plan: {
    type: String,
    enum: ["499", "1299", "3999"]
  },

  status: {
    type: String,
    default: "Active"
  },

  media: [String],

  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Sponsor = mongoose.model("Sponsor", SponsorSchema);

// ===============================
// CLOUDINARY
// ===============================

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "paviko",
    allowed_formats: [
      "jpg",
      "jpeg",
      "png",
      "gif",
      "mp4",
      "mov",
      "avi"
    ]
  }
});

const upload = multer({
  storage: storage
});

// ===============================
// TWILIO
// ===============================

let twilioClient = null;

if (
  process.env.TWILIO_ACCOUNT_SID &&
  process.env.TWILIO_AUTH_TOKEN
) {
  twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
}

// ===============================
// RAZORPAY
// ===============================

let razorpay = null;

if (
  process.env.RAZORPAY_KEY_ID &&
  process.env.RAZORPAY_KEY_SECRET
) {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
}

// ===============================
// OTP
// ===============================

const otpStore = {};

// ===============================
// HOME / HEALTH CHECK
// ===============================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Paviko Backend is running",
    version: "V1"
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "online"
  });
});

// ===============================
// OTP SEND
// ===============================

app.post("/api/auth/send-otp", async (req, res) => {
  try {
    const { mobile, role } = req.body;

    if (!/^[6-9][0-9]{9}$/.test(mobile)) {
      return res.status(400).json({
        error: "Invalid mobile number"
      });
    }

    const otp = Math.floor(
      100000 + Math.random() * 900000
    );

    otpStore[mobile] = {
      otp,
      role: role || "customer",
      expires: Date.now() + 5 * 60 * 1000
    };

    if (!twilioClient) {
      return res.status(500).json({
        error: "Twilio is not configured"
      });
    }

    await twilioClient.messages.create({
      body: `Your Paviko OTP is ${otp}. Valid for 5 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: "+91" + mobile
    });

    res.json({
      success: true,
      message: "OTP sent successfully"
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: error.message
    });
  }
});

// ===============================
// OTP VERIFY
// ===============================

app.post("/api/auth/verify-otp", async (req, res) => {
  try {
    const { mobile, otp, role } = req.body;

    const stored = otpStore[mobile];

    if (!stored) {
      return res.status(400).json({
        error: "OTP not found"
      });
    }

    if (
      stored.otp !== Number(otp) ||
      stored.expires < Date.now()
    ) {
      return res.status(400).json({
        error: "Invalid or expired OTP"
      });
    }

    let user = await User.findOne({
      mobile
    });

    if (!user) {
      user = await User.create({
        mobile,
        role: role || stored.role || "customer"
      });
    }

    delete otpStore[mobile];

    const token = crypto
      .randomBytes(32)
      .toString("hex");

    res.json({
      success: true,
      user: {
        id: user._id,
        mobile: user.mobile,
        role: user.role
      },
      token
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

// ===============================
// GET USER
// ===============================

app.get("/api/auth/me", async (req, res) => {
  try {
    const { mobile } = req.query;

    if (!mobile) {
      return res.status(400).json({
        error: "Mobile number required"
      });
    }

    const user = await User.findOne({
      mobile
    });

    if (!user) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    res.json({
      success: true,
      user
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

// ===============================
// CREATE WORKER
// ===============================

app.post(
  "/api/workers/profile",
  upload.fields([
    {
      name: "profilePhoto",
      maxCount: 1
    },
    {
      name: "workPhotos",
      maxCount: 10
    },
    {
      name: "workVideos",
      maxCount: 5
    }
  ]),
  async (req, res) => {

    try {
      const {
        name,
        mobile,
        service,
        subSkill,
        city,
        area,
        experience,
        fee,
        about
      } = req.body;

      const existing = await Worker.findOne({
        mobile
      });

      if (existing) {
        return res.status(400).json({
          error: "Worker already exists"
        });
      }

      const media = [];

      if (
        req.files &&
        req.files.workPhotos
      ) {
        req.files.workPhotos.forEach(file => {
          media.push({
            url: file.path,
            kind: "image"
          });
        });
      }

      if (
        req.files &&
        req.files.workVideos
      ) {
        req.files.workVideos.forEach(file => {
          media.push({
            url: file.path,
            kind: "video"
          });
        });
      }

      const worker = await Worker.create({
        name,
        mobile,
        service,
        subSkill,
        city,
        area,
        experience: Number(experience) || 0,
        fee: Number(fee) || 0,
        about,
        media,
        status: "Pending Verification"
      });

      res.json({
        success: true,
        worker
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: error.message
      });
    }
  }
);

// ===============================
// GET WORKERS
// ===============================

app.get("/api/workers", async (req, res) => {
  try {

    const {
      q,
      city,
      service,
      area
    } = req.query;

    const query = {
      status: "Verified"
    };

    if (
      service &&
      service !== "All Services"
    ) {
      query.service = service;
    }

    if (city) {
      query.city = new RegExp(city, "i");
    }

    if (area) {
      query.area = new RegExp(area, "i");
    }

    if (q) {
      query.$or = [
        {
          name: new RegExp(q, "i")
        },
        {
          service: new RegExp(q, "i")
        },
        {
          subSkill: new RegExp(q, "i")
        }
      ];
    }

    const workers = await Worker
      .find(query)
      .limit(50);

    res.json({
      success: true,
      workers
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

// ===============================
// GET WORKER
// ===============================

app.get("/api/workers/:id", async (req, res) => {
  try {

    const worker = await Worker.findById(
      req.params.id
    );

    if (!worker) {
      return res.status(404).json({
        error: "Worker not found"
      });
    }

    res.json({
      success: true,
      worker
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

// ===============================
// CREATE BOOKING
// ===============================

app.post("/api/bookings", async (req, res) => {
  try {

    const {
      workerId,
      service,
      date,
      time,
      address,
      details,
      customerName,
      customerMobile,
      amount
    } = req.body;

    const bookingId =
      "BOOK-" +
      Date.now()
        .toString()
        .slice(-8);

    const booking =
      await Booking.create({
        bookingId,
        workerId,
        service,
        date,
        time,
        address,
        details,
        customerName,
        customerMobile,
        amount: Number(amount) || 0,
        status: "Booking Request Sent"
      });

    res.json({
      success: true,
      booking
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

// ===============================
// GET BOOKINGS
// ===============================

app.get("/api/bookings", async (req, res) => {
  try {

    const bookings =
      await Booking
        .find()
        .sort({
          createdAt: -1
        });

    res.json({
      success: true,
      bookings
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

// ===============================
// BOOKING STATUS
// ===============================

app.patch(
  "/api/bookings/:id/status",
  async (req, res) => {

    try {

      const { status } = req.body;

      const allowed = [
        "Booking Request Sent",
        "Accepted",
        "Rejected",
        "Completed",
        "Cancelled"
      ];

      if (!allowed.includes(status)) {
        return res.status(400).json({
          error: "Invalid status"
        });
      }

      const booking =
        await Booking.findByIdAndUpdate(
          req.params.id,
          { status },
          { new: true }
        );

      if (!booking) {
        return res.status(404).json({
          error: "Booking not found"
        });
      }

      res.json({
        success: true,
        booking
      });

    } catch (error) {
      res.status(500).json({
        error: error.message
      });
    }
  }
);

// ===============================
// RAZORPAY ORDER
// ===============================

app.post(
  "/api/payments/order",
  async (req, res) => {

    try {

      if (!razorpay) {
        return res.status(500).json({
          error: "Razorpay is not configured"
        });
      }

      const {
        bookingId,
        amount,
        feePercent
      } = req.body;

      const finalAmount =
        Number(amount);

      if (
        !finalAmount ||
        finalAmount <= 0
      ) {
        return res.status(400).json({
          error: "Invalid amount"
        });
      }

      const order =
        await razorpay.orders.create({
          amount:
            Math.round(finalAmount * 100),
          currency: "INR",
          receipt:
            String(bookingId),
          notes: {
            bookingId:
              String(bookingId)
          }
        });

      const percent =
        Number(feePercent) || 10;

      const pavikoFee =
        finalAmount * percent / 100;

      const workerAmount =
        finalAmount - pavikoFee;

      await Payment.create({
        orderId: order.id,
        amount: finalAmount,
        feePercent: percent,
        pavikoFee,
        workerAmount,
        status: "Pending"
      });

      res.json({
        success: true,
        keyId:
          process.env.RAZORPAY_KEY_ID,
        order
      });

    } catch (error) {
      res.status(500).json({
        error: error.message
      });
    }
  }
);

// ===============================
// RAZORPAY VERIFY
// ===============================

app.post(
  "/api/payments/verify",
  async (req, res) => {

    try {

      const {
        orderId,
        paymentId,
        signature
      } = req.body;

      const body =
        orderId + "|" + paymentId;

      const expectedSignature =
        crypto
          .createHmac(
            "sha256",
            process.env.RAZORPAY_KEY_SECRET
          )
          .update(body)
          .digest("hex");

      if (
        expectedSignature !== signature
      ) {
        return res.status(400).json({
          error:
            "Invalid payment signature"
        });
      }

      const payment =
        await Payment.findOneAndUpdate(
          { orderId },
          {
            paymentId,
            status: "Paid"
          },
          { new: true }
        );

      if (!payment) {
        return res.status(404).json({
          error: "Payment record not found"
        });
      }

      res.json({
        success: true,
        message:
          "Payment verified successfully"
      });

    } catch (error) {
      res.status(500).json({
        error: error.message
      });
    }
  }
);

// ===============================
// REVIEWS
// ===============================

app.post("/api/reviews", async (req, res) => {
  try {

    const {
      bookingId,
      rating,
      review,
      customerId
    } = req.body;

    const booking =
      await Booking.findOne({
        bookingId
      });

    if (!booking) {
      return res.status(404).json({
        error: "Booking not found"
      });
    }

    const newReview =
      await Review.create({
        bookingId: booking._id,
        workerId: booking.workerId,
        customerId,
        rating: Number(rating),
        review
      });

    const reviews =
      await Review.find({
        workerId: booking.workerId
      });

    const total =
      reviews.reduce(
        (sum, item) =>
          sum + item.rating,
        0
      );

    const average =
      reviews.length
        ? total / reviews.length
        : 0;

    await Worker.findByIdAndUpdate(
      booking.workerId,
      {
        rating:
          Number(average.toFixed(1)),
        totalReviews:
          reviews.length
      }
    );

    res.json({
      success: true,
      review: newReview
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

// ===============================
// SPONSORS
// ===============================

app.post(
  "/api/sponsors",
  async (req, res) => {

    try {

      const sponsor =
        await Sponsor.create(req.body);

      res.json({
        success: true,
        sponsor
      });

    } catch (error) {
      res.status(500).json({
        error: error.message
      });
    }
  }
);

app.get(
  "/api/sponsors",
  async (req, res) => {

    try {

      const sponsors =
        await Sponsor.find({
          status: "Active"
        });

      res.json({
        success: true,
        sponsors
      });

    } catch (error) {
      res.status(500).json({
        error: error.message
      });
    }
  }
);

// ===============================
// ADMIN SUMMARY
// ===============================

app.get(
  "/api/admin/summary",
  async (req, res) => {

    try {

      const users =
        await User.countDocuments();

      const workers =
        await Worker.countDocuments();

      const bookings =
        await Booking.countDocuments();

      const paidPayments =
        await Payment.countDocuments({
          status: "Paid"
        });

      res.json({
        success: true,
        summary: {
          users,
          workers,
          bookings,
          paidPayments
        }
      });

    } catch (error) {
      res.status(500).json({
        error: error.message
      });
    }
  }
);

// ===============================
// CLOUDINARY MEDIA UPLOAD
// ===============================

app.post(
  "/api/media/cloudinary",
  upload.array("media", 10),
  async (req, res) => {

    try {

      const files =
        (req.files || []).map(file => ({
          url: file.path,
          filename: file.filename,
          kind:
            file.mimetype.startsWith("video")
              ? "video"
              : "image"
        }));

      res.json({
        success: true,
        files
      });

    } catch (error) {
      res.status(500).json({
        error: error.message
      });
    }
  }
);

// ===============================
// 404
// ===============================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "API route not found"
  });
});

// ===============================
// SERVER
// ===============================

const PORT =
  process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(
    `Paviko Backend running on port ${PORT}`
  );
});
