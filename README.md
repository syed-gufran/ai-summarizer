# 📚 AI Book Summarizer

An AI-powered book summarizer built with **Node.js (Backend)** and **Vercel (Frontend)**, using **GROQ API** for generating summaries. This project is designed to be cost-effective using **free tools and APIs**, with support for user-supplied API keys.
<img width="1352" alt="Image" src="https://github.com/user-attachments/assets/4be5ff8b-1cc5-47f4-9f7a-656b8e25cd8d" />
---

## 🧠 Features

* Upload and summarize book PDFs
* Chat-like interface for interacting with the book content
* Summary generated using the **Groq LLM API**
* Support for user’s own API key
* PDF is divided into manageable chunks for processing

---

## 🛠️ Tech Stack

| Component | Tech Used                                          |
| --------- | -------------------------------------------------- |
| Backend   | Node.js (deployed on [Render](https://render.com)) |
| Frontend  | React (deployed on [Vercel](https://vercel.com))   |
| AI Model  | Groq API (user-provided key)                       |
| Storage   | Browser Memory (stateful chunk handling)           |

---

## ⚠️ Limitations

* **Free APIs and tools** are used; hence:

  * **Only limited number of pages** can be processed.
  * PDFs are split into **chunks**, and a large number of pages results in too many chunks.
  * **API limits and browser state limits** may be exceeded.
* Recommendation:

  * **Use smaller PDFs** or extract relevant sections for best results.
  * If errors occur, please **report the issue** via the contact method provided.

---

## 🚀 Getting Started

### Prerequisites

* Node.js
* Groq API key (user must bring their own)

### Installation

```bash
git clone https://github.com/your-username/book-summarizer.git
cd book-summarizer
npm install
```

### Running Locally

```bash
# Set your Groq API key in .env
GROQ_API_KEY=your_key_here

npm start
```
<img width="1352" alt="Image" src="https://github.com/user-attachments/assets/7101cf71-1eca-42df-a50c-416d85664d3d" />
---

## 🌐 Deployment

* **Backend**: Deployed on Render
* **Frontend**: Deployed on Vercel
* **Environment Variables** must be configured accordingly on both platforms.

---

## 🤝 Contributing

Feel free to fork and raise a pull request for enhancements or bug fixes.

---

## 📩 Contact

For any issues, feedback, or support, please contact:
📧 email us : tazeema07@gmail.com , samarthnegi1209@gmail.com
