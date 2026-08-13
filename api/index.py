import os
import json
import uuid
import datetime
import re
import base64
from functools import wraps

import requests
from flask import Flask, request, jsonify, session
from flask_cors import CORS

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "735637adffc674de3b7704c69c8d6372d7cef7a3819c332abfeb308592e83f0b")
app.url_map.strict_slashes = False
CORS(app, supports_credentials=True)

# ---------------------------------------------------------------------------
# Storage (Vercel Blob) - With hardcoded fallback token
# ---------------------------------------------------------------------------
BLOB_TOKEN = os.environ.get(
    "BLOB_READ_WRITE_TOKEN",
    "vercel_blob_rw_RhVMFMxBigsUHFnn_rjoM8AgX9iCQmvAShywb0XeD0LHrS9"
).strip()

BLOB_BASE = "https://blob.vercel-storage.com"

# Payment account details (public)
TELEBIRR_ACCOUNT = "0940213338"
CBE_ACCOUNT = "1000641150324"

class StorageError(Exception):
    pass

def read_blob(filename):
    if not BLOB_TOKEN:
        raise StorageError("BLOB_READ_WRITE_TOKEN is not configured")
    url = f"{BLOB_BASE}/{filename}?token={BLOB_TOKEN}"
    headers = {"Authorization": f"Bearer {BLOB_TOKEN}"}
    try:
        resp = requests.get(url, headers=headers, timeout=15)
    except requests.RequestException as e:
        raise StorageError(f"Could not read {filename}: network error")
    if resp.status_code == 404:
        return None
    if resp.status_code != 200:
        raise StorageError(f"Could not read {filename}: HTTP {resp.status_code}")
    text = resp.text.strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        raise StorageError(f"Could not read {filename}: invalid JSON")

def write_blob(filename, data):
    if not BLOB_TOKEN:
        raise StorageError("BLOB_READ_WRITE_TOKEN is not configured")
    url = f"{BLOB_BASE}/{filename}?token={BLOB_TOKEN}"
    headers = {
        "Authorization": f"Bearer {BLOB_TOKEN}",
        "Content-Type": "application/json",
    }
    try:
        resp = requests.put(url, data=json.dumps(data), headers=headers, timeout=20)
    except requests.RequestException as e:
        raise StorageError(f"Could not write {filename}: network error")
    if resp.status_code not in (200, 201, 204):
        raise StorageError(f"Could not write {filename}: HTTP {resp.status_code} - {resp.text[:300]}")

def ensure_blob(filename, initial):
    data = read_blob(filename)
    if data is None:
        write_blob(filename, initial)
        return initial
    return data

def load_products():
    data = ensure_blob("products.json", [])
    if not isinstance(data, list):
        raise StorageError("products.json is not a list")
    return data

def save_products(products):
    write_blob("products.json", products)

def load_orders():
    data = ensure_blob("orders.json", [])
    if not isinstance(data, list):
        raise StorageError("orders.json is not a list")
    return data

def save_orders(orders):
    write_blob("orders.json", orders)

def load_users():
    data = ensure_blob("users.json", [])
    if not isinstance(data, list):
        raise StorageError("users.json is not a list")
    return data

def save_users(users):
    write_blob("users.json", users)

def load_messages():
    data = ensure_blob("messages.json", {})
    if not isinstance(data, dict):
        raise StorageError("messages.json is not an object")
    return data

def save_messages(messages):
    write_blob("messages.json", messages)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def utc_now():
    return datetime.datetime.utcnow().isoformat(timespec="seconds") + "Z"

def normalize_email(email):
    return (email or "").strip().lower()

def is_valid_email(email):
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email or ""))

def is_valid_phone(phone):
    return bool(re.match(r"^[0-9+\-\s]{7,20}$", phone or ""))

def _error(message, status_code):
    return jsonify({"success": False, "error": message}), status_code

def find_user_by_email(users, email):
    return next((u for u in users if u.get("email") == email), None)

def find_user_by_id(users, user_id):
    return next((u for u in users if u.get("id") == user_id), None)

# ---------------------------------------------------------------------------
# Admin auth
# ---------------------------------------------------------------------------
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "time").strip()

def is_admin():
    return bool(session.get("admin"))

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not is_admin():
            return _error("Admin authentication required", 401)
        return f(*args, **kwargs)
    return decorated

# ---------------------------------------------------------------------------
# Message helper with duplicate protection
# ---------------------------------------------------------------------------
def create_system_message(conversation_id, text, order_id=None, event_id=None):
    if not conversation_id:
        return None
    messages = load_messages()
    conversation = messages.setdefault(conversation_id, [])
    if event_id and any(m.get("eventId") == event_id for m in conversation):
        return None
    message = {
        "id": "msg_" + uuid.uuid4().hex,
        "conversationId": conversation_id,
        "userId": conversation_id,
        "sender": "admin",
        "message": text,
        "timestamp": utc_now(),
        "read": False,
        "orderId": order_id,
        "type": "system",
        "eventId": event_id,
    }
    conversation.append(message)
    save_messages(messages)
    return message

# ---------------------------------------------------------------------------
# Status transitions
# ---------------------------------------------------------------------------
ORDER_TRANSITIONS = {
    "pending": {"approved", "rejected"},
    "approved": {"delivered", "rejected"},
    "rejected": {"approved"},
    "delivered": set(),
    "cancelled": set(),
}

# ---------------------------------------------------------------------------
# Routes: system
# ---------------------------------------------------------------------------
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "success": True,
        "service": "TIME BRAND API",
        "status": "online"
    })

# ---------------------------------------------------------------------------
# Routes: auth
# ---------------------------------------------------------------------------
@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    data = request.get_json(silent=True) or {}
    password = data.get("password", "")
    if not ADMIN_PASSWORD:
        return _error("Admin password is not configured", 500)
    if password != ADMIN_PASSWORD:
        return _error("Invalid admin password", 401)
    session.permanent = True
    session["admin"] = True
    return jsonify({"success": True, "admin": True, "message": "Login successful"})

@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    session.pop("admin", None)
    return jsonify({"success": True})

@app.route("/api/auth/check", methods=["GET"])
def auth_check():
    return jsonify({"success": True, "admin": is_admin()})

# Alias for backward compatibility
@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    return auth_login()

@app.route("/api/admin/logout", methods=["POST"])
def admin_logout():
    return auth_logout()

@app.route("/api/admin/check", methods=["GET"])
def admin_check():
    return auth_check()

# ---------------------------------------------------------------------------
# Routes: products
# ---------------------------------------------------------------------------
@app.route("/api/products", methods=["GET"])
def list_products():
    products = load_products()
    if not is_admin():
        products = [p for p in products if p.get("active", True)]
    return jsonify({"success": True, "products": products})

@app.route("/api/products", methods=["POST"])
@admin_required
def create_product():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return _error("Product name is required", 400)
    try:
        price = float(data.get("price", 0))
        if price <= 0:
            raise ValueError
    except (TypeError, ValueError):
        return _error("Valid positive price is required", 400)
    try:
        stock = int(data.get("stock", 0))
        if stock < 0:
            raise ValueError
    except (TypeError, ValueError):
        return _error("Stock must be non-negative", 400)

    products = load_products()
    new_id = max((p.get("id", 0) for p in products), default=0) + 1
    product = {
        "id": new_id,
        "name": name,
        "description": (data.get("description") or "").strip(),
        "price": price,
        "currency": (data.get("currency") or "ETB").upper(),
        "image": (data.get("image") or "/assets/watch-placeholder.svg").strip(),
        "category": (data.get("category") or "Sneakers").strip(),
        "stock": stock,
        "sizes": data.get("sizes") or ["40", "41", "42", "43", "44"],
        "active": bool(data.get("active", True)),
        "featured": bool(data.get("featured", False)),
        "createdAt": utc_now(),
        "updatedAt": utc_now(),
    }
    products.append(product)
    save_products(products)
    return jsonify({"success": True, "product": product}), 201

@app.route("/api/products/<int:product_id>", methods=["PUT"])
@admin_required
def update_product(product_id):
    products = load_products()
    product = next((p for p in products if p.get("id") == product_id), None)
    if not product:
        return _error("Product not found", 404)
    data = request.get_json(silent=True) or {}
    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            return _error("Product name cannot be empty", 400)
        product["name"] = name
    if "price" in data:
        try:
            price = float(data["price"])
            if price <= 0:
                raise ValueError
        except (TypeError, ValueError):
            return _error("Valid positive price is required", 400)
        product["price"] = price
    if "stock" in data:
        try:
            stock = int(data["stock"])
            if stock < 0:
                raise ValueError
        except (TypeError, ValueError):
            return _error("Stock must be non-negative", 400)
        product["stock"] = stock
    for field in ["description", "currency", "image", "category"]:
        if field in data:
            product[field] = str(data[field]).strip()
    if "sizes" in data:
        product["sizes"] = data["sizes"]
    if "active" in data:
        product["active"] = bool(data["active"])
    if "featured" in data:
        product["featured"] = bool(data["featured"])
    product["updatedAt"] = utc_now()
    save_products(products)
    return jsonify({"success": True, "product": product})

@app.route("/api/products/<int:product_id>", methods=["DELETE"])
@admin_required
def delete_product(product_id):
    products = load_products()
    before = len(products)
    products = [p for p in products if p.get("id") != product_id]
    if len(products) == before:
        return _error("Product not found", 404)
    save_products(products)
    return jsonify({"success": True})

# ---------------------------------------------------------------------------
# Routes: orders
# ---------------------------------------------------------------------------
@app.route("/api/orders", methods=["GET"])
def list_orders():
    orders = load_orders()
    if is_admin():
        return jsonify({"success": True, "orders": orders})
    user_id = request.args.get("userId")
    if not user_id:
        return _error("userId is required", 401)
    orders = [o for o in orders if o.get("userId") == user_id]
    return jsonify({"success": True, "orders": orders})

@app.route("/api/orders", methods=["POST"])
def create_order():
    data = request.get_json(silent=True) or {}
    customer = data.get("customer") or {}
    user_id = customer.get("userId") or data.get("userId")
    name = customer.get("userName") or customer.get("name") or data.get("userName")
    email = normalize_email(customer.get("email") or data.get("email"))
    phone = customer.get("phone") or data.get("phone")
    address = customer.get("shippingAddress") or data.get("shippingAddress") or ""
    payment_method = (customer.get("paymentMethod") or data.get("paymentMethod") or "").lower()
    payment_reference = customer.get("paymentReference") or data.get("paymentReference") or ""
    payment_proof = customer.get("paymentProof") or data.get("paymentProof") or ""

    if not user_id or not (user_id.startswith("user_") or user_id.startswith("guest_")):
        return _error("Valid userId is required", 400)
    if not name or not str(name).strip():
        return _error("Customer name is required", 400)
    if not is_valid_email(email):
        return _error("Valid customer email is required", 400)
    if phone and not is_valid_phone(phone):
        return _error("Valid phone is required", 400)
    if payment_method not in ("telebirr", "cbe"):
        return _error("Payment method must be Telebirr or CBE", 400)
    if not payment_reference:
        return _error("Payment reference is required", 400)

    orders = load_orders()
    duplicate = next(
        (o for o in orders if o.get("paymentReference") == payment_reference),
        None
    )
    if duplicate:
        return _error("This payment reference has already been used", 400)

    items_data = data.get("items") or []
    if not isinstance(items_data, list) or not items_data:
        return _error("At least one item is required", 400)

    products = load_products()
    product_map = {int(p["id"]): p for p in products}

    validated_items = []
    total = 0.0

    for item in items_data:
        try:
            product_id = int(item.get("productId"))
            quantity = int(item.get("quantity"))
        except (TypeError, ValueError):
            return _error("Each item needs numeric productId and quantity", 400)
        if quantity < 1:
            return _error("Quantity must be at least 1", 400)
        product = product_map.get(product_id)
        if not product:
            return _error(f"Product #{product_id} not found", 400)
        if not product.get("active", True):
            return _error(f"Product #{product_id} is not active", 400)
        stock = int(product.get("stock", 0))
        if quantity > stock:
            return _error(f"Only {stock} unit(s) left for product #{product_id}", 400)
        unit_price = float(product["price"])
        subtotal = round(unit_price * quantity, 2)
        total += subtotal
        validated_items.append({
            "productId": product_id,
            "name": product.get("name"),
            "quantity": quantity,
            "unitPrice": unit_price,
            "subtotal": subtotal,
        })

    total = round(total, 2)
    next_id = max((o.get("id", 0) for o in orders), default=1000) + 1

    payment_account = TELEBIRR_ACCOUNT if payment_method == "telebirr" else CBE_ACCOUNT

    order = {
        "id": next_id,
        "userId": user_id,
        "userName": str(name).strip(),
        "email": email,
        "phone": phone or "",
        "address": address,
        "items": validated_items,
        "total": total,
        "currency": product_map[validated_items[0]["productId"]].get("currency", "ETB"),
        "paymentMethod": payment_method,
        "paymentAccount": payment_account,
        "paymentReference": payment_reference,
        "paymentProof": payment_proof,
        "paymentStatus": "pending",
        "paymentSubmittedAt": utc_now(),
        "status": "pending",
        "createdAt": utc_now(),
        "updatedAt": utc_now(),
    }

    orders.append(order)
    save_orders(orders)

    create_system_message(
        user_id,
        f"🧾 Payment proof received for order #{order['id']}.\nOur team will review your payment and update your order shortly.",
        order_id=order["id"],
        event_id=f"order_{order['id']}_payment_submitted",
    )

    return jsonify({"success": True, "order": order}), 201

@app.route("/api/orders/<int:order_id>", methods=["PUT"])
@admin_required
def update_order(order_id):
    orders = load_orders()
    order = next((o for o in orders if o.get("id") == order_id), None)
    if not order:
        return _error("Order not found", 404)
    data = request.get_json(silent=True) or {}
    for field in ["userName", "email", "phone", "address"]:
        if field in data:
            order[field] = str(data[field]).strip()
    order["updatedAt"] = utc_now()
    save_orders(orders)
    return jsonify({"success": True, "order": order})

@app.route("/api/orders/<int:order_id>", methods=["DELETE"])
@admin_required
def delete_order(order_id):
    orders = load_orders()
    before = len(orders)
    orders = [o for o in orders if o.get("id") != order_id]
    if len(orders) == before:
        return _error("Order not found", 404)
    save_orders(orders)
    return jsonify({"success": True})

# ---------------------------------------------------------------------------
# Payment verification/rejection
# ---------------------------------------------------------------------------
@app.route("/api/orders/<int:order_id>/verify-payment", methods=["POST"])
@admin_required
def verify_payment(order_id):
    orders = load_orders()
    order = next((o for o in orders if o.get("id") == order_id), None)
    if not order:
        return _error("Order not found", 404)
    if order.get("paymentStatus") not in ("pending", "rejected"):
        return _error("Payment cannot be verified in current state", 400)

    order["paymentStatus"] = "verified"
    order["paymentVerifiedAt"] = utc_now()
    order["updatedAt"] = utc_now()
    save_orders(orders)

    create_system_message(
        order["userId"],
        f"✅ Your payment for order #{order_id} has been verified.\nYour order is now waiting for approval.",
        order_id=order_id,
        event_id=f"order_{order_id}_payment_verified",
    )

    return jsonify({"success": True, "order": order})

@app.route("/api/orders/<int:order_id>/reject-payment", methods=["POST"])
@admin_required
def reject_payment(order_id):
    reason = (request.get_json(silent=True) or {}).get("reason", "").strip()
    if not reason:
        return _error("Rejection reason is required", 400)
    orders = load_orders()
    order = next((o for o in orders if o.get("id") == order_id), None)
    if not order:
        return _error("Order not found", 404)
    if order.get("paymentStatus") not in ("pending", "verified"):
        return _error("Payment cannot be rejected in current state", 400)

    order["paymentStatus"] = "rejected"
    order["paymentRejectedAt"] = utc_now()
    order["paymentRejectionReason"] = reason
    order["updatedAt"] = utc_now()
    save_orders(orders)

    create_system_message(
        order["userId"],
        f"❌ Your payment for order #{order_id} could not be verified.\nReason: {reason}\nPlease submit valid payment proof or contact TIME BRAND.",
        order_id=order_id,
        event_id=f"order_{order_id}_payment_rejected",
    )

    return jsonify({"success": True, "order": order})

# ---------------------------------------------------------------------------
# Order status actions
# ---------------------------------------------------------------------------
@app.route("/api/orders/<int:order_id>/approve", methods=["POST"])
@admin_required
def approve_order(order_id):
    orders = load_orders()
    order = next((o for o in orders if o.get("id") == order_id), None)
    if not order:
        return _error("Order not found", 404)
    if order.get("paymentStatus") != "verified":
        return _error("Payment must be verified before the order can be approved", 400)
    if order.get("status") not in ("pending", "rejected"):
        return _error("Order cannot be approved in current state", 400)

    order["status"] = "approved"
    order["approvedAt"] = utc_now()
    order["updatedAt"] = utc_now()
    save_orders(orders)

    create_system_message(
        order["userId"],
        f"✅ Your order #{order_id} has been APPROVED!\nYou will receive shipping updates soon.",
        order_id=order_id,
        event_id=f"order_{order_id}_approved",
    )

    return jsonify({"success": True, "order": order})

@app.route("/api/orders/<int:order_id>/reject", methods=["POST"])
@admin_required
def reject_order(order_id):
    reason = (request.get_json(silent=True) or {}).get("reason", "").strip()
    if not reason:
        return _error("Rejection reason is required", 400)
    orders = load_orders()
    order = next((o for o in orders if o.get("id") == order_id), None)
    if not order:
        return _error("Order not found", 404)
    if order.get("status") not in ("pending", "approved"):
        return _error("Order cannot be rejected in current state", 400)

    order["status"] = "rejected"
    order["rejectionReason"] = reason
    order["rejectedAt"] = utc_now()
    order["updatedAt"] = utc_now()
    save_orders(orders)

    create_system_message(
        order["userId"],
        f"❌ Your order #{order_id} has been REJECTED.\nReason: {reason}\nPlease contact TIME BRAND support.",
        order_id=order_id,
        event_id=f"order_{order_id}_rejected",
    )

    return jsonify({"success": True, "order": order})

@app.route("/api/orders/<int:order_id>/deliver", methods=["POST"])
@admin_required
def deliver_order(order_id):
    orders = load_orders()
    order = next((o for o in orders if o.get("id") == order_id), None)
    if not order:
        return _error("Order not found", 404)
    if order.get("status") != "approved":
        return _error("Order must be approved before delivery", 400)

    order["status"] = "delivered"
    order["deliveredAt"] = utc_now()
    order["updatedAt"] = utc_now()
    save_orders(orders)

    create_system_message(
        order["userId"],
        f"📦 Your order #{order_id} has been DELIVERED!\nThank you for shopping with TIME BRAND.",
        order_id=order_id,
        event_id=f"order_{order_id}_delivered",
    )

    return jsonify({"success": True, "order": order})

# ---------------------------------------------------------------------------
# Routes: users
# ---------------------------------------------------------------------------
@app.route("/api/users", methods=["GET"])
@admin_required
def list_users():
    return jsonify({"success": True, "users": load_users()})

@app.route("/api/users", methods=["POST"])
def create_or_login_user():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = normalize_email(data.get("email"))
    phone = (data.get("phone") or "").strip()
    register = bool(data.get("register", False))

    if not name:
        return _error("Name is required", 400)
    if not is_valid_email(email):
        return _error("Valid email is required", 400)
    if phone and not is_valid_phone(phone):
        return _error("Valid phone is required", 400)

    users = load_users()
    existing = find_user_by_email(users, email)
    if existing:
        existing["name"] = name
        existing["phone"] = phone
        save_users(users)
        return jsonify({"success": True, "user": existing})

    user_id = "user_" + uuid.uuid4().hex[:16] if register else f"guest_{email}"
    user = {
        "id": user_id,
        "name": name,
        "email": email,
        "phone": phone,
        "createdAt": utc_now(),
    }
    users.append(user)
    save_users(users)
    return jsonify({"success": True, "user": user}), 201

# ---------------------------------------------------------------------------
# Routes: messages
# ---------------------------------------------------------------------------
@app.route("/api/messages", methods=["GET"])
@admin_required
def list_conversations():
    messages = load_messages()
    users = load_users()
    conversations = []
    for conversation_id, msgs in messages.items():
        if not msgs:
            continue
        latest = msgs[-1]
        unread = sum(1 for m in msgs if not m.get("read"))
        user = find_user_by_id(users, conversation_id)
        conversations.append({
            "conversationId": conversation_id,
            "customerName": user.get("name", "Unknown") if user else conversation_id,
            "customerEmail": user.get("email", "") if user else conversation_id,
            "unreadCount": unread,
            "latestMessage": latest,
            "messageCount": len(msgs),
        })
    conversations.sort(key=lambda c: c.get("latestMessage", {}).get("timestamp", ""), reverse=True)
    return jsonify({"success": True, "conversations": conversations})

@app.route("/api/messages/<path:conversation_id>", methods=["GET"])
def get_messages(conversation_id):
    messages = load_messages()
    conversation = messages.get(conversation_id, [])
    return jsonify({
        "success": True,
        "conversationId": conversation_id,
        "messages": conversation,
    })

@app.route("/api/messages", methods=["POST"])
def post_message():
    data = request.get_json(silent=True) or {}
    conversation_id = data.get("conversationId") or data.get("userId")
    sender = data.get("sender", "user")
    text = (data.get("message") or "").strip()
    order_id = data.get("orderId")

    if not conversation_id:
        return _error("conversationId is required", 400)
    if not text:
        return _error("Message text is required", 400)
    if sender not in ("user", "admin"):
        return _error("Invalid sender", 400)
    if sender == "admin" and not is_admin():
        return _error("Admin authentication required", 401)
    if sender == "user" and not conversation_id.startswith(("user_", "guest_")):
        return _error("Invalid customer conversation ID", 400)

    messages = load_messages()
    message = {
        "id": "msg_" + uuid.uuid4().hex,
        "conversationId": conversation_id,
        "userId": conversation_id,
        "sender": sender,
        "message": text,
        "timestamp": utc_now(),
        "read": False,
        "orderId": order_id,
        "type": "text",
    }
    messages.setdefault(conversation_id, []).append(message)
    save_messages(messages)
    return jsonify({"success": True, "message": message}), 201

@app.route("/api/messages/<path:conversation_id>/read", methods=["PATCH"])
def mark_messages_read(conversation_id):
    messages = load_messages()
    conversation = messages.get(conversation_id, [])
    changed = False
    for message in conversation:
        if not message.get("read"):
            message["read"] = True
            changed = True
    if changed:
        save_messages(messages)
    return jsonify({"success": True, "updated": changed})

@app.route("/api/messages/<path:conversation_id>", methods=["DELETE"])
@admin_required
def delete_conversation(conversation_id):
    messages = load_messages()
    if conversation_id in messages:
        del messages[conversation_id]
        save_messages(messages)
    return jsonify({"success": True})

# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------
@app.errorhandler(StorageError)
def handle_storage_error(error):
    return jsonify({"success": False, "error": str(error)}), 500

@app.errorhandler(404)
def handle_not_found(error):
    return _error("Not found", 404)

@app.errorhandler(405)
def handle_method_not_allowed(error):
    return _error("Method not allowed", 405)

@app.errorhandler(500)
def handle_internal_error(error):
    return _error("Internal server error", 500)

if __name__ == "__main__":
    app.run(debug=True)