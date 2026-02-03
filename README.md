# DayDream Browser
<div align="center">
    <img src="https://gitlab.com/nightnetwork/daydreamx/-/raw/main/assets/DDXBanner.png" style="width: 1200px"/>
    <h2>Explore the Web with DayDream</h2>
</div>

![inpreview](https://gitlab.com/nightnetwork/daydreamx/-/raw/main/assets/daydreamx.png)

> [!IMPORTANT]
> Please consider giving the original repository a star if you fork this project.

## Features

- Sleek UI/UX
- Web Proxy/ UBG features (Panic key, cloak, etc)
- Advanced Tabs inplementation
- Dual Proxy support with Scramjet as primary
- Advanced bookamrsk system
- Detailed History
- Extensions
- Heavy Obfuscation (fonts and text are hidden)
- Night+ Support (Advanced VPN with MullvadVPN support, and more!!!)
- Advanced Theming (supports custom themes and custom background)
- Advanced Search suggestions (Find websites, pages and features in the browser, games, etc)
- Developer Tools
- Advanced profiles and data system

## Deployment

> [!WARNING]
> DayDream X cannot be hosted on static web hosting platforms such as Netlify, GitHub Pages, or Cloudflare Pages.

### Installation & Setup

```bash
git clone https://gitlab.com/nightnetwork/daydreamx.git
cd DayDreamX
pnpm install
pnpm build
cp config.example.js config.js
pnpm start
```

The app will run on `http://127.0.0.1:8080` (localhost only, not accessible from other machines).

#### Production Deployment

For production deployments, you need to configure security settings:

1. **Copy and configure the config file:**
   ```bash
   cp config.example.js config.js
   ```

2. **Update security settings in `config.js`:**
   - Change `server.host` to `"0.0.0.0"` to accept external connections
   - Generate a secure marketplace PSK:
     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     ```
   - Replace `"changeme"` in `marketplace.psk` with the generated value

3. **Set up a reverse proxy (REQUIRED for production):**
   
   Never expose the Node.js server directly to the internet. Always use a reverse proxy:

   **nginx example:**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://127.0.0.1:8080;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

   **Caddy example:**
   ```
   your-domain.com {
       reverse_proxy localhost:8080
   }
   ```

4. **Enable HTTPS:**
   Use Let's Encrypt with certbot (nginx) or Caddy's automatic HTTPS.

5. **Configure firewall:**
   ```bash
   # Allow only necessary ports (example using ufw)
   sudo ufw allow 80/tcp    # HTTP
   sudo ufw allow 443/tcp   # HTTPS
   sudo ufw allow 22/tcp    # SSH (if needed)
   sudo ufw enable
   
   # Block direct access to Node.js port
   sudo ufw deny 8080/tcp
   ```

6. **Start the application:**
   ```bash
   bun start
   ```

> [!WARNING]
> **Production Security Checklist:**
> - ✅ Changed marketplace PSK from "changeme"
> - ✅ Set `host: "0.0.0.0"` in config.js
> - ✅ Reverse proxy (nginx/Caddy) configured
> - ✅ HTTPS enabled with valid certificate
> - ✅ Firewall rules configured
> - ✅ config.js added to .gitignore (do not commit secrets)

Alternative package managers:
```bash
# For npm
npm install
npm build
cp config.example.js config.js
npm start

# For pnpm
pnpm install
pnpm start
```

### Updating

```bash
git pull --force --allow-unrelated-histories
```

For assistance, deployment methods, or to access links, join our [Discord Server](https://discord.night-x.com) or open a discussion on GitLab.

## Contributing

To contribute, fork the repository, implement your changes, and submit a pull request. Please test your code thoroughly before submission. For detailed contribution guidelines, refer to [CONTRIB.md](https://gitlab.com/nightnetwork/daydreamx/blob/main/CONTRIB.md).

## Community

Join our Discord community for support, access to our Link Archive, and to connect with other users.

[![Discord](https://invidget.switchblade.xyz/QmWUfvm4bn?theme=dark)](https://discord.night-x.com)
