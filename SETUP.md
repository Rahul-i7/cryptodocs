# Setup on Windows + VS Code

1. Install **Node.js 22 LTS** from nodejs.org (includes npm). Install **VS Code** and the ESLint + Tailwind CSS IntelliSense extensions (optional).
2. Open the `CryptoDocs` folder in VS Code (File > Open Folder).
3. Terminal (Ctrl+`):
   ```
   npm install
   npm run dev
   ```
   Open the URL it prints (usually http://localhost:3000 or :5173) in Chrome/Edge.
4. Run tests: `npm test`
5. Demo: Seal tab -> pick any PDF + recipients -> download package -> Decrypt tab as Mira Chen, then Asha Rao -> download both PDFs -> Verify tab with either PDF -> VALID report naming the recipient.

For a real air-gapped machine: run `npm install` once on a connected PC, then copy the whole folder (including `node_modules`) by USB.
Note: this project uses npm; `package-lock.json` is the only lockfile.
