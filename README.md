# TIME BRAND

Premium sneaker e-commerce store with Flask backend, Vercel Blob storage, and vanilla JS frontend.

## Features

- Customer storefront with product grid, search, filters, cart, checkout, order history.
- Admin dashboard with orders, products, customers, chat.
- Approve/reject/deliver order actions with automatic customer chat notifications.
- Persistent storage via Vercel Blob (products.json, orders.json, users.json, messages.json).
- Responsive design with dark luxury aesthetic.

## Project Structure

\`\`\`
timebrand/
├── api/
│   └── index.py
├── public/
│   ├── index.html
│   ├── admin.html
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── api.js
│   │   ├── auth.js
│   │   ├── store.js
│   │   ├── admin.js
│   │   └── chat.js
│   └── assets/
│       └── watch-placeholder.svg
├── requirements.txt
├── vercel.json
├── .gitignore
└── README.md
\`\`\`

## Local Development

1. Create virtual environment:
   \`\`\`bash
   python -m venv venv
   source venv/bin/activate
   \`\`\`
2. Install dependencies:
   \`\`\`bash
   pip install -r requirements.txt
   \`\`\`
3. Set environment variables:
   \`\`\`bash
   export BLOB_READ_WRITE_TOKEN="your_vercel_blob_token"
   export ADMIN_PASSWORD="your_admin_password"
   export SECRET_KEY="your_secret_key"
   \`\`\`
   (For local testing, a dummy token works, but storage will fail. Use real Vercel Blob token.)
4. Run Flask:
   \`\`\`bash
   python api/index.py
   \`\`\`
5. Open `http://localhost:5000` for store, `http://localhost:5000/admin.html` for admin.

## Vercel Deployment

1. Create a Vercel Blob store and copy the `BLOB_READ_WRITE_TOKEN`.
2. In Vercel project settings, add environment variables:
   - `BLOB_READ_WRITE_TOKEN`
   - `ADMIN_PASSWORD`
   - `SECRET_KEY`
3. Push code to GitHub and import repository to Vercel.
4. Deploy.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/products` | List products |
| POST | `/api/products` | Create product (admin) |
| PUT | `/api/products/<id>` | Update product (admin) |
| DELETE | `/api/products/<id>` | Delete product (admin) |
| GET | `/api/orders` | List orders (admin or filtered by userId) |
| POST | `/api/orders` | Create order |
| PUT | `/api/orders/<id>` | Update order details (admin) |
| DELETE | `/api/orders/<id>` | Delete order (admin) |
| POST | `/api/orders/<id>/approve` | Approve order |
| POST | `/api/orders/<id>/reject` | Reject order (requires reason) |
| POST | `/api/orders/<id>/deliver` | Deliver order |
| GET | `/api/users` | List users (admin) |
| POST | `/api/users` | Create/login user |
| GET | `/api/messages/<user_id>` | Get messages for user |
| POST | `/api/messages` | Send message |
| PATCH | `/api/messages/<user_id>/read` | Mark messages read |
| DELETE | `/api/messages/<user_id>` | Delete conversation (admin) |
| POST | `/api/admin/login` | Admin login |
| POST | `/api/admin/logout` | Admin logout |
| GET | `/api/admin/check` | Check admin session |

## Troubleshooting

- **API 404**: Ensure `api/index.py` exists and `vercel.json` is correct.
- **Storage errors**: Check `BLOB_READ_WRITE_TOKEN` environment variable.
- **Admin login**: Set `ADMIN_PASSWORD` and `SECRET_KEY`.
- **No approve/reject buttons**: Orders with status other than `pending` will not show those buttons. Use admin dashboard to see correct buttons.

## License

For demonstration purposes only.