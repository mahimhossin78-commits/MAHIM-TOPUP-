const express = require("express");
const cookieSession = require("cookie-session");
const bcrypt = require("bcryptjs");
const admin = require("firebase-admin");

const app = express();
app.set("trust proxy", 1);

const PORT = Number(process.env.PORT || 3000);
const SECRET = process.env.SESSION_SECRET || "CHANGE_THIS_SESSION_SECRET";

const packages = [
  ["Weekly",165],["Monthly",850],["25 Diamond",23],["50 Diamond",45],
  ["115 Diamond",85],["240 Diamond",175],["355 Diamond",245],["480 Diamond",340],
  ["505 Diamond",360],["610 Diamond",430],["850 Diamond",600],["1090 Diamond",735],
  ["1240 Diamond",855],["2530 Diamond",1690],["5060 Diamond",3240],["10120 Diamond",5500]
].map((x,i)=>({id:i+1,name:x[0],price:x[1],active:true}));

const defaultSettings = {
  site_name:"MAHIM TOPUP",
  tagline:"Fast & Secure Free Fire Top-Up",
  notice:"অর্ডারের পর Admin যাচাই করে status পরিবর্তন করবেন।",
  bkash:"01346261152",
  nagad:"01890884185",
  telegram:"https://t.me/Tanjulislam1152",
  whatsapp:"https://wa.me/8801346261152"
};

function initFirebase(){
  if(admin.apps.length) return;
  let credential;
  if(process.env.FIREBASE_SERVICE_ACCOUNT_JSON){
    try{
      const raw=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      credential=admin.credential.cert(raw);
    }catch(e){
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON");
    }
  } else if(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY){
    credential=admin.credential.cert({
      projectId:process.env.FIREBASE_PROJECT_ID,
      clientEmail:process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g,"\n")
    });
  } else {
    throw new Error("Firebase credentials are missing. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY.");
  }
  admin.initializeApp({credential});
}
initFirebase();

const db=admin.firestore();
const FieldValue=admin.firestore.FieldValue;

async function ensureDefaults(){
  const settingsRef=db.collection("app").doc("settings");
  const productsRef=db.collection("app").doc("products");
  const adminRef=db.collection("app").doc("admin");
  const [s,p,a]=await Promise.all([settingsRef.get(),productsRef.get(),adminRef.get()]);

  if(!s.exists) await settingsRef.set(defaultSettings);
  if(!p.exists) await productsRef.set({items:packages});
  if(!a.exists) await adminRef.set({
    username:"admin",
    password_hash:bcrypt.hashSync(process.env.ADMIN_PASSWORD || "admin12345",12)
  });
}
ensureDefaults().catch(err=>{console.error(err);process.exit(1);});

app.use(express.json());
app.use(cookieSession({
  name:"mahim",
  keys:[SECRET],
  httpOnly:true,
  sameSite:"lax",
  secure:process.env.NODE_ENV==="production",
  maxAge:30*24*60*60*1000
}));
app.use(express.static(require("path").join(__dirname,"public")));

const customerRef=uid=>db.collection("customers").doc(uid);
const orderRef=id=>db.collection("orders").doc(String(id));

function makeCustomerUid(){ return "local-"+Date.now()+"-"+Math.random().toString(36).slice(2); }
function makeCustomerId(){ return "CUS-"+Date.now().toString(36).toUpperCase()+"-"+Math.floor(100+Math.random()*900); }
function makeOrderId(){ return "MT"+Date.now().toString().replace(/\D/g,"").slice(-10)+Math.floor(1000+Math.random()*9000); }

async function getSettings(){
  const s=await db.collection("app").doc("settings").get();
  return s.exists ? s.data() : defaultSettings;
}
async function getProducts(){
  const p=await db.collection("app").doc("products").get();
  return p.exists ? (p.data().items||[]) : packages;
}
async function getAdmin(){
  const a=await db.collection("app").doc("admin").get();
  return a.exists ? a.data() : null;
}
async function getCustomer(uid){
  const d=await customerRef(uid).get();
  return d.exists ? {id:d.id,...d.data()} : null;
}
async function requireCustomer(req,res,next){
  if(!req.session.customerUid) return res.status(401).json({error:"Login required"});
  const c=await getCustomer(req.session.customerUid);
  if(!c){req.session=null;return res.status(401).json({error:"Login required"});}
  req.customer=c; next();
}
function requireAdmin(req,res,next){
  if(!req.session.admin) return res.status(401).json({error:"Admin login required"});
  next();
}

app.get("/api/config",async(req,res)=>{
  const [settings,products]=await Promise.all([getSettings(),getProducts()]);
  res.json({settings,products:products.filter(p=>p.active)});
});

app.post("/api/customer/register",async(req,res)=>{
  try{
    const name=String(req.body.name||"").trim();
    const email=String(req.body.email||"").trim().toLowerCase();
    const phone=String(req.body.phone||"").trim();
    const password=String(req.body.password||"");
    if(!name||!email||!phone||password.length<6)
      return res.status(400).json({error:"Name, email, mobile and password (6+ chars) are required"});

    const snap=await db.collection("customers").where("email","==",email).limit(1).get();
    if(!snap.empty) return res.status(400).json({error:"This email is already registered"});

    const uid=makeCustomerUid();
    const c={
      customer_uid:uid, customer_id:makeCustomerId(), name,email,phone,
      password_hash:bcrypt.hashSync(password,12),
      created_at:new Date().toISOString()
    };
    await customerRef(uid).set(c);
    req.session.customerUid=uid;
    const {password_hash,...safe}=c;
    res.json({customer:safe});
  }catch(e){console.error(e);res.status(500).json({error:"Registration failed"});}
});

app.post("/api/customer/login",async(req,res)=>{
  try{
    const email=String(req.body.email||"").trim().toLowerCase();
    const password=String(req.body.password||"");
    const snap=await db.collection("customers").where("email","==",email).limit(1).get();
    if(snap.empty) return res.status(401).json({error:"Email or password is incorrect"});
    const d=snap.docs[0].data();
    if(!d.password_hash || !bcrypt.compareSync(password,d.password_hash))
      return res.status(401).json({error:"Email or password is incorrect"});
    req.session.customerUid=d.customer_uid;
    const {password_hash,...safe}=d;
    res.json({customer:safe});
  }catch(e){console.error(e);res.status(500).json({error:"Login failed"});}
});

app.post("/api/logout",(req,res)=>{req.session=null;res.json({ok:true});});

app.get("/api/me",requireCustomer,async(req,res)=>{
  const snap=await db.collection("orders").where("customer_uid","==",req.customer.customer_uid).get();
  const orders=snap.docs.map(d=>d.data()).sort((a,b)=>(b.id||0)-(a.id||0));
  res.json({customer:req.customer,orders});
});

app.post("/api/orders",requireCustomer,async(req,res)=>{
  try{
    const products=await getProducts();
    const p=products.find(x=>x.id===Number(req.body.product_id)&&x.active);
    if(!p||!req.body.uid||!req.body.trx_id||!req.body.payment_method)
      return res.status(400).json({error:"Package, UID, payment method and TrxID required"});

    const id=Date.now();
    const o={
      id,order_id:makeOrderId(),
      customer_uid:req.customer.customer_uid,
      customer_id:req.customer.customer_id,
      customer_name:req.customer.name,
      player_uid:String(req.body.uid),
      package:p.name,amount:p.price,
      payment_method:String(req.body.payment_method),
      trx_id:String(req.body.trx_id),
      status:"PENDING",admin_note:"",internal_note:"",
      created_at:new Date().toISOString(),completed_at:null
    };
    await orderRef(id).set(o);
    res.json({order:o});
  }catch(e){console.error(e);res.status(500).json({error:"Order failed"});}
});

app.post("/api/admin/login",async(req,res)=>{
  try{
    const username=String(req.body.username||"").trim();
    const password=String(req.body.password||"");
    const a=await getAdmin();
    if(a && username===a.username && bcrypt.compareSync(password,a.password_hash)){
      req.session.admin=true; return res.json({ok:true});
    }
    res.status(401).json({error:"Invalid credentials"});
  }catch(e){console.error(e);res.status(500).json({error:"Admin login failed"});}
});
app.post("/api/admin/logout",(req,res)=>{req.session=null;res.json({ok:true});});

app.get("/api/admin/all",requireAdmin,async(req,res)=>{
  const [os,cs,products,settings]=await Promise.all([
    db.collection("orders").get(),
    db.collection("customers").get(),
    getProducts(),getSettings()
  ]);
  const orders=os.docs.map(d=>d.data()).sort((a,b)=>(b.id||0)-(a.id||0));
  const customers=cs.docs.map(d=>{const x=d.data();delete x.password_hash;return x;});
  res.json({orders,customers,products,settings});
});

app.patch("/api/admin/orders/:id",requireAdmin,async(req,res)=>{
  const ref=orderRef(req.params.id);
  const snap=await ref.get();
  if(!snap.exists) return res.status(404).json({error:"Not found"});
  const o=snap.data();
  const update={
    status:req.body.status!==undefined?String(req.body.status):o.status,
    admin_note:req.body.admin_note!==undefined?String(req.body.admin_note):o.admin_note||"",
    internal_note:req.body.internal_note!==undefined?String(req.body.internal_note):o.internal_note||""
  };
  if(update.status==="COMPLETED") update.completed_at=o.completed_at||new Date().toISOString();
  else update.completed_at=null;
  await ref.update(update);
  res.json({ok:true});
});

app.patch("/api/admin/products/:id",requireAdmin,async(req,res)=>{
  const products=await getProducts();
  const p=products.find(x=>x.id===Number(req.params.id));
  if(!p)return res.status(404).json({error:"Not found"});
  p.name=String(req.body.name||p.name);p.price=Number(req.body.price);p.active=!!req.body.active;
  await db.collection("app").doc("products").set({items:products});
  res.json({ok:true});
});

app.patch("/api/admin/settings",requireAdmin,async(req,res)=>{
  const settings=await getSettings();
  for(const k of Object.keys(defaultSettings)) if(req.body[k]!==undefined) settings[k]=String(req.body[k]);
  await db.collection("app").doc("settings").set(settings);
  res.json({ok:true});
});

app.post("/api/admin/password",requireAdmin,async(req,res)=>{
  const old=String(req.body.old||"");
  const neu=String(req.body.new||"");
  const a=await getAdmin();
  if(!a||!bcrypt.compareSync(old,a.password_hash)) return res.status(400).json({error:"Old password wrong"});
  if(neu.length<8)return res.status(400).json({error:"Minimum 8 characters"});
  await db.collection("app").doc("admin").update({password_hash:bcrypt.hashSync(neu,12)});
  res.json({ok:true});
});

app.get("/admin",(req,res)=>res.sendFile(require("path").join(__dirname,"public/admin.html")));
app.get("*",(req,res)=>res.sendFile(require("path").join(__dirname,"public/index.html")));

app.listen(PORT,()=>console.log("MAHIM TOPUP running on port "+PORT));
