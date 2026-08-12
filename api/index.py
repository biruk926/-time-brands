import os
import json
import re
import uuid
import datetime
from functools import wraps

import requests
from flask import Flask, request, jsonify, session
from flask_cors import CORS

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "timebrand-dev-secret-change-me")
app.url_map.strict_slashes = False
CORS(app)

# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------
BLOB_TOKEN = os.environ.get("BLOB_READ_WRITE_TOKEN", "").strip()
BLOB_BASE = "https://blob.vercel-storage.com"


class StorageError(Exception):
    pass


def _check_token():
    if not BLOB_TOKEN:
        raise StorageError("BLOB_READ_WRITE_TOKEN is not configured")


def read_blob(filename):
    _check_token()
    url = f"{BLOB_BASE}/{filename}"
    headers = {
        "Authorization": f"Bearer {BLOB_TOKEN}",
        "x-api-version": "6",
    }
    try:
        resp = requests.get(url, headers=headers, timeout=10)
    except requests.RequestException as exc:
        app.logger.error("Storage read network error for %s: %s", filename, exc)
        raise StorageError(f"Could not read {filename}: network error")

    if resp.status_code == 404:
        return None

    if resp.status_code != 200:
        app.logger.error("Storage read failed for %s: HTTP %s", filename, resp.status_code)
        raise StorageError(f"Could not read {filename}: HTTP {resp.status_code}")

    text = resp.text.strip()
    if not text:
        return None

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        app.logger.error("Storage read invalid JSON for %s", filename)
        raise StorageError(f"Could not read {filename}: invalid JSON")


def write_blob(filename, data):
    _check_token()
    url = f"{BLOB_BASE}/{filename}"
    headers = {
        "Authorization": f"Bearer {BLOB_TOKEN}",
        "Content-Type": "application/json",
        "x-api-version": "6",
    }
    try:
        resp = requests.put(
            url,
            data=json.dumps(data),
            headers=headers,
            timeout=15,
        )
    except requests.RequestException as exc:
        app.logger.error("Storage write network error for %s: %s", filename, exc)
        raise StorageError(f"Could not write {filename}: network error")

    if resp.status_code not in (200, 201, 204):
        app.logger.error(
            "Storage write failed for %s: HTTP %s: %s",
            filename,
            resp.status_code,
            resp.text[:200],
        )
        raise StorageError(f"Could not write {filename}: HTTP {resp.status_code}")


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
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "").strip()


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
        app.logger.info(
            "Duplicate system message skipped for %s: %s",
            conversation_id,
            event_id,
        )
        return None

    message = {
        "id": "msg_" + uuid.uuid4().hex,
        "conversationId": conversation_id,
        "sender": "system",
        "message": text,
        "timestamp": utc_now(),
        "read": False,
        "orderId": order_id,
        "type": "system",
        "eventId": event_id,
    }

    conversation.append(message)
    save_messages(messages)
    app.logger.info("System message created for %s: %s", conversation_id, event_id)
    return message


# ---------------------------------------------------------------------------
# Status transitions
# ---------------------------------------------------------------------------
ALLOWED_TRANSITIONS = {
    "pending": {"approved", "rejected"},
    "approved": {"processing", "rejected"},
    "processing": {"shipped", "cancelled"},
    "shipped": {"delivered", "cancelled"},
    "delivered": set(),
    "rejected": {"approved"},
    "cancelled": set(),
}

STATUSES = set(ALLOWED_TRANSITIONS.keys())


# ---------------------------------------------------------------------------
# Routes: system
# ---------------------------------------------------------------------------
@app.route("/api/test", methods=["GET"])
def api_test():
    return jsonify({"success": True, "message": "TIME BRAND API is working"})


@app.route("/api/health", methods=["GET"])
def api_health():
    return jsonify(
        {
            "success": True,
            "service": "TIME BRAND API",
            "status": "healthy",
            "storage": "configured" if BLOB_TOKEN else "missing",
        }
    )


# ---------------------------------------------------------------------------
# Routes: admin auth
# ---------------------------------------------------------------------------
@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    if not ADMIN_PASSWORD:
        return _error("Admin password is not configured. Set ADMIN_PASSWORD.", 500)

    data = request.get_json(silent=True) or {}
    password = data.get("password", "")

    if password != ADMIN_PASSWORD:
        app.logger.warning("Admin login failed")
        return _error("Invalid admin password", 401)

    session.permanent = True
    session["admin"] = True
    app.logger.info("Admin logged in")
    return jsonify({"success": True, "admin": True})


@app.route("/api/admin/logout", methods=["POST"])
def admin_logout():
    session.pop("admin", None)
    return jsonify({"success": True})


@app.route("/api/admin/check", methods=["GET"])
def admin_check():
    return jsonify({"success": True, "admin": is_admin()})


# ---------------------------------------------------------------------------
# Routes: products
# ---------------------------------------------------------------------------
@app.route("/api/products", methods=["GET"])
def list_products():
    products = load_products()
    if not is_admin():
        products = [p for p in products if p.get("active", True)]
    return jsonify({"success": True, "products": products})


@app.route("/api/products/<int:product_id>", methods=["GET"])
def get_product(product_id):
    product = next(
        (p for p in load_products() if p.get("id") == product_id), None
    )
    if not product:
        return _error("Product not found", 404)
    return jsonify({"success": True, "product": product})


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
        return _error("Stock must be a non-negative integer", 400)

    products = load_products()
    new_id = max((p.get("id", 0) for p in products), default=0) + 1
    product = {
        "id": new_id,
        "name": name,
        "description": (data.get("description") or "").strip(),
        "price": price,
        "currency": (data.get("currency") or "ETB").upper(),
        "image": (data.get("image") or "/assets/watch-placeholder.svg").strip(),
        "category": (data.get("category") or "Watches").strip(),
        "stock": stock,
        "active": bool(data.get("active", True)),
        "createdAt": utc_now(),
        "updatedAt": utc_now(),
    }
    products.append(product)
    save_products(products)
    app.logger.info("Product created: %s", product["id"])
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
            return _error("Stock must be a non-negative integer", 400)
        product["stock"] = stock

    for field in ["description", "currency", "image", "category"]:
        if field in data:
            product[field] = str(data[field]).strip()

    if "active" in data:
        product["active"] = bool(data["active"])

    product["updatedAt"] = utc_now()
    save_products(products)
    app.logger.info("Product updated: %s", product["id"])
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
    app.logger.info("Product deleted: %s", product_id)
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


@app.route("/api/orders/<int:order_id>", methods=["GET"])
def get_order(order_id):
    order = next((o for o in load_orders() if o.get("id") == order_id), None)
    if not order:
        return _error("Order not found", 404)

    if not is_admin() and order.get("userId") != request.args.get("userId"):
        return _error("Order not found", 404)

    return jsonify({"success": True, "order": order})


@app.route("/api/orders", methods=["POST"])
def create_order():
    data = request.get_json(silent=True) or {}

    customer = data.get("customer") or {}
    user_id = customer.get("userId") or data.get("userId")
    name = customer.get("userName") or customer.get("name") or data.get("userName")
    email = normalize_email(customer.get("email") or data.get("email"))
    phone = customer.get("phone") or data.get("phone")
    shipping = customer.get("shippingAddress") or data.get("shippingAddress") or ""

    if not user_id or not (user_id.startswith("user_") or user_id.startswith("guest_")):
        return _error("Valid userId is required", 400)
    if not name or not str(name).strip():
        return _error("Customer name is required", 400)
    if not is_valid_email(email):
        return _error("Valid customer email is required", 400)
    if phone and not is_valid_phone(phone):
        return _error("Valid phone is required", 400)

    items_data = data.get("items") or []
    if not isinstance(items_data, list) or not items_data:
        return _error("At least one item is required", 400)

    products = load_products()
    product_map = {}
    for p in products:
        product_map[int(p.get("id"))] = p

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
            return _error(
                f"Only {stock} unit(s) left for product #{product_id}",
                400,
            )

        unit_price = float(product["price"])
        subtotal = round(unit_price * quantity, 2)
        total += subtotal

        validated_items.append(
            {
                "productId": product_id,
                "name": product.get("name"),
                "quantity": quantity,
                "unitPrice": unit_price,
                "subtotal": subtotal,
            }
        )

    total = round(total, 2)

    orders = load_orders()
    next_id = max((o.get("id", 0) for o in orders), default=1000) + 1

    order = {
        "id": next_id,
        "userId": user_id,
        "userName": str(name).strip(),
        "email": email,
        "phone": phone or "",
        "items": validated_items,
        "total": total,
        "currency": validated_items[0]["unitPrice"].get("currency", "ETB")
        if isinstance(validated_items[0]["unitPrice"], dict)
        else product_map[validated_items[0]["productId"]].get("currency", "ETB"),
        "shippingAddress": shipping,
        "status": "pending",
        "createdAt": utc_now(),
        "updatedAt": utc_now(),
    }

    # Set correct currency from first product
    first_product_id = validated_items[0]["productId"]
    order["currency"] = product_map[first_product_id].get("currency", "ETB")

    orders.append(order)
    save_orders(orders)

    create_system_message(
        user_id,
        f"🛍️ Your order #{order['id']} has been received and is pending approval.",
        order_id=order["id"],
        event_id=f"order_{order['id']}_created",
    )

    app.logger.info("Order created: %s", order["id"])
    return jsonify({"success": True, "order": order}), 201


@app.route("/api/orders/<int:order_id>/status", methods=["PATCH"])
@admin_required
def update_order_status(order_id):
    data = request.get_json(silent=True) or {}
    new_status = data.get("status")
    reason = (data.get("reason") or "").strip()

    if new_status not in STATUSES:
        return _error("Invalid status", 400)

    orders = load_orders()
    order = next((o for o in orders if o.get("id") == order_id), None)
    if not order:
        return _error("Order not found", 404)

    old_status = order.get("status")
    if new_status not in ALLOWED_TRANSITIONS.get(old_status, set()):
        return _error(
            f"Status transition {old_status} -> {new_status} is not allowed",
            400,
        )

    if new_status == "rejected" and not reason:
        return _error("Rejection reason is required", 400)

    order["status"] = new_status
    order["updatedAt"] = utc_now()

    if new_status == "approved":
        order["approvedAt"] = utc_now()
    elif new_status == "rejected":
        order["rejectedAt"] = utc_now()
        order["rejectionReason"] = reason
    elif new_status == "processing":
        order["processingAt"] = utc_now()
    elif new_status == "shipped":
        order["shippedAt"] = utc_now()
    elif new_status == "delivered":
        order["deliveredAt"] = utc_now()
    elif new_status == "cancelled":
        order["cancelledAt"] = utc_now()

    save_orders(orders)

    messages_map = {
        "approved": f"✅ Your order #{order_id} has been APPROVED! You will receive shipping updates soon.",
        "rejected": f"❌ Your order #{order_id} has been REJECTED. Reason: {reason}. Contact: 0940213338.",
        "processing": f"🔄 Your order #{order_id} is now PROCESSING.",
        "shipped": f"🚚 Your order #{order_id} has been SHIPPED.",
        "delivered": f"📦 Your order #{order_id} has been DELIVERED! Thank you for shopping at TIME BRAND.",
        "cancelled": f"❌ Your order #{order_id} has been CANCELLED.",
    }

    message_text = messages_map.get(
        new_status,
        f"Order #{order_id} status changed to {new_status}.",
    )
    event_id = f"order_{order_id}_status_{new_status}"

    message = create_system_message(
        order["userId"],
        message_text,
        order_id=order_id,
        event_id=event_id,
    )

    app.logger.info("Order %s status changed to %s", order_id, new_status)
    return jsonify(
        {
            "success": True,
            "order": order,
            "message": message,
            "messageCreated": message is not None,
        }
    )


@app.route("/api/orders/<int:order_id>", methods=["DELETE"])
@admin_required
def delete_order(order_id):
    orders = load_orders()
    before = len(orders)
    orders = [o for o in orders if o.get("id") != order_id]
    if len(orders) == before:
        return _error("Order not found", 404)
    save_orders(orders)
    app.logger.info("Order deleted: %s", order_id)
    return jsonify({"success": True})


# ---------------------------------------------------------------------------
# Routes: users
# ---------------------------------------------------------------------------
@app.route("/api/users", methods=["GET"])
@admin_required
def list_users():
    return jsonify({"success": True, "users": load_users()})


@app.route("/api/users/<path:user_id>", methods=["GET"])
def get_user(user_id):
    user = find_user_by_id(load_users(), user_id)
    if not user:
        return _error("User not found", 404)
    return jsonify({"success": True, "user": user})


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
    app.logger.info("User created: %s", user_id)
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

        conversations.append(
            {
                "conversationId": conversation_id,
                "customerName": user.get("name", "Unknown") if user else conversation_id,
                "customerEmail": user.get("email", "") if user else conversation_id,
                "unreadCount": unread,
                "latestMessage": latest,
                "messageCount": len(msgs),
            }
        )

    conversations.sort(
        key=lambda c: c.get("latestMessage", {}).get("timestamp", ""),
        reverse=True,
    )
    return jsonify({"success": True, "conversations": conversations})


@app.route("/api/messages/<path:conversation_id>", methods=["GET"])
def get_messages(conversation_id):
    messages = load_messages()
    conversation = messages.get(conversation_id, [])
    return jsonify(
        {
            "success": True,
            "conversationId": conversation_id,
            "messages": conversation,
        }
    )


@app.route("/api/messages", methods=["POST"])
def post_message():
    data = request.get_json(silent=True) or {}
    conversation_id = data.get("conversationId")
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
        "sender": sender,
        "message": text,
        "timestamp": utc_now(),
        "read": False,
        "orderId": order_id,
        "type": "text",
    }

    messages.setdefault(conversation_id, []).append(message)
    save_messages(messages)
    app.logger.info("Message sent in %s by %s", conversation_id, sender)
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
    app.logger.error("Storage error: %s", error)
    return jsonify({"success": False, "error": str(error)}), 500


@app.errorhandler(404)
def handle_not_found(error):
    return _error("Not found", 404)


@app.errorhandler(405)
def handle_method_not_allowed(error):
    return _error("Method not allowed", 405)


@app.errorhandler(500)
def handle_internal_error(error):
    app.logger.error("Internal server error: %s", error)
    return _error("Internal server error", 500)


if __name__ == "__main__":
    app.run(debug=True)