# VEIL

### Local Steganography Workstation

VEIL is a browser-only steganography workstation for hiding data inside images.

It combines **LSB image steganography**, **optional AES-256-GCM encryption**, **binary payload containers**, **SHA-256 hashing**, and **local file processing** into a single interface.

There is no backend.

There is no upload.

There is no account.

**Your files stay in your browser.**

---

## What VEIL Does

VEIL lets you hide either text or arbitrary files inside an image.

The workflow is intentionally simple:

```text
Carrier Image
      │
      ▼
   VEIL Encode
      │
      ├── Optional AES-256-GCM encryption
      │
      ├── Binary payload container
      │
      ├── LSB RGB embedding
      │
      ▼
   PNG Output
      │
      ▼
   VEIL Decode
      │
      ├── Validate container
      ├── Verify CRC-32
      ├── Decrypt if required
      └── Extract original payload
```

VEIL also verifies its own encoded output before reporting a successful operation.

---

## Core Features

* **Browser-only processing**
* **No server or backend**
* **PNG, WebP, and JPEG input**
* **PNG output**
* **Text payloads**
* **Arbitrary file payloads**
* **LSB RGB steganography**
* **Optional AES-256-GCM encryption**
* **PBKDF2-SHA256 password derivation**
* **SHA-256 hashing**
* **CRC-32 payload integrity checking**
* **Automatic carrier capacity analysis**
* **Drag-and-drop file handling**
* **Payload extraction and download**
* **Image inspection**
* **Encode → decode round-trip verification**
* **Web Worker acceleration where available**
* **Main-thread fallback for `file://` usage**
* **Responsive interface**
* **Keyboard-accessible controls**
* **Light and dark themes**
* **Local preference persistence**
* **No external dependencies**

---

# Privacy First

VEIL is designed around local processing.

When you select an image or payload, the data is processed directly by your browser.

```text
Your Files
    │
    ▼
┌───────────────┐
│    Browser    │
│               │
│ Decode        │
│ Encrypt       │
│ Embed         │
│ Hash          │
│ Extract       │
│ Verify        │
└───────────────┘
    │
    ▼
Your Device
```

There is no VEIL server receiving your files.

Passwords are never stored or transmitted.

No analytics or tracking infrastructure is required for the application to function.

> **Nothing leaves this browser.**

This should not be interpreted as a guarantee of anonymity or protection against a compromised device/browser.

---

# Architecture

VEIL is intentionally built without a framework or build system.

```text
HTML
 │
 ├── Application structure
 │
 └── Accessible controls
 │
CSS
 │
 ├── Visual system
 │
 ├── Responsive layouts
 │
 └── Interaction states
 │
JavaScript
 │
 ├── UI/state management
 ├── File handling
 ├── Canvas processing
 ├── Steganography engine
 ├── Binary serialization
 ├── Cryptography
 ├── Hashing
 └── Verification
```

The application uses plain browser APIs rather than external libraries.

Heavy operations such as pixel embedding, extraction, and hashing prefer a **Web Worker** when available.

When VEIL is opened directly using a `file://` URL, many browsers restrict worker construction. VEIL therefore falls back to running the same algorithms on the main thread.

For the best processing behavior, serve the directory through a static HTTP server.

---

# Steganography

VEIL currently uses:

## `LSB_RGB`

One bit is stored in the least-significant bit of each RGB channel.

For every pixel:

```text
R → G → B → R → G → B → ...
```

Pixels are processed in row-major order.

Alpha values are left untouched.

Conceptually:

```text
Original

R: 10110110
G: 01101101
B: 11001000

Hidden bits:

      1       0       1

Result

R: 10110111
G: 01101100
B: 11001001
```

The changes are small enough that the resulting image remains visually indistinguishable under normal viewing conditions.

---

# Capacity

Because three bits are available per pixel:

```text
width × height × 3 bits
```

The approximate raw byte capacity is:

```text
floor(width × height × 3 / 8)
```

The actual usable capacity is lower because VEIL reserves space for its payload container and metadata.

VEIL calculates capacity before encoding and refuses payloads that cannot fit.

Example:

```text
IMAGE
1920 × 1080

PIXELS
2,073,600

RAW RGB CAPACITY
~778 KB

USABLE PAYLOAD
slightly lower after container overhead
```

Capacity depends on the carrier dimensions, not simply its file size.

---

# Binary Payload Format

VEIL does not dump an unstructured stream of bytes into the image.

Instead, it embeds a small versioned binary container.

Conceptually:

```text
┌──────────────────────────────┐
│ Magic bytes                  │
├──────────────────────────────┤
│ Version                      │
├──────────────────────────────┤
│ Flags                        │
├──────────────────────────────┤
│ Payload type                 │
├──────────────────────────────┤
│ Filename length              │
├──────────────────────────────┤
│ MIME length                  │
├──────────────────────────────┤
│ Original payload size        │
├──────────────────────────────┤
│ Salt (16 bytes)              │
├──────────────────────────────┤
│ IV / nonce (12 bytes)        │
├──────────────────────────────┤
│ Filename                     │
├──────────────────────────────┤
│ MIME type                    │
├──────────────────────────────┤
│ Payload bytes                │
├──────────────────────────────┤
│ CRC-32                       │
└──────────────────────────────┘
```

A 32-bit length prefix stored in the image tells the decoder how many bits belong to the container.

Before trusting the payload, the decoder validates:

1. Magic bytes
2. Version
3. Structural lengths
4. Payload boundaries
5. CRC-32 integrity

This means a corrupted or truncated image fails explicitly instead of being interpreted as arbitrary data.

---

# Encryption

Steganography and encryption serve different purposes.

**Steganography hides the existence of the payload.**

**Encryption protects the contents of the payload.**

VEIL optionally encrypts the payload before embedding it.

The encryption pipeline is:

```text
Password
   │
   ▼
PBKDF2-SHA256
310,000 iterations
   │
   ▼
AES-256-GCM key
   │
   ▼
Encrypt payload
   │
   ▼
Authenticated ciphertext
   │
   ▼
Steganographic embedding
```

When encryption is enabled:

* A fresh **16-byte random salt** is generated.
* A fresh **12-byte random nonce/IV** is generated.
* PBKDF2-SHA256 derives the encryption key.
* AES-256-GCM encrypts and authenticates the payload.
* Salt and nonce information are stored with the container.
* The password itself is never stored.

Randomness comes from:

```text
crypto.getRandomValues()
```

and the Web Crypto API.

VEIL does **not** implement cryptographic primitives manually.

---

# Authentication & Integrity

AES-GCM provides authenticated encryption.

This means decryption does not simply attempt to produce plaintext.

The authentication tag must verify successfully.

Therefore:

```text
Correct password + untouched payload
                │
                ▼
             SUCCESS
```

while:

```text
Wrong password
      │
      ▼
Authentication failure
```

and:

```text
Modified ciphertext
      │
      ▼
Authentication failure
```

The container additionally uses CRC-32 to detect corruption at the payload-container level.

These mechanisms serve different purposes and are not interchangeable.

---

# JPEG Warning

JPEG is a lossy format.

Lossy compression changes pixel values, which can destroy LSB-embedded information.

Therefore:

```text
JPEG
  │
  ▼
Decode / inspect
  │
  ▼
VEIL
  │
  ▼
PNG output
```

VEIL always exports encoded carriers as PNG.

JPEG input is supported for inspection and encoding, but VEIL warns that the original JPEG carrier is not suitable for preserving embedded LSB data through JPEG recompression.

Once encoded, do not pass the resulting PNG through a JPEG conversion or other lossy image pipeline.

---

# Verification

VEIL does not consider an encode operation successful merely because an image was generated.

After encoding:

```text
Encode
  │
  ▼
Generate PNG
  │
  ▼
Decode generated PNG
  │
  ▼
Validate container
  │
  ▼
Verify integrity
  │
  ▼
Verify payload
  │
  ▼
SUCCESS
```

This provides an immediate round-trip check and catches implementation or processing failures before the user receives the output.

---

# Hashing

VEIL can calculate SHA-256 hashes using the browser's Web Crypto API.

Hashes can be useful for verifying that a file has remained unchanged.

Example:

```text
SHA-256

a4f1...9d83
```

Hashing is used for integrity verification and identification.

It is **not encryption**.

---

# Supported Formats

### Input

| Format | Support                                 |
| ------ | --------------------------------------- |
| PNG    | Full                                    |
| WebP   | Full                                    |
| JPEG   | Inspection / decode; output becomes PNG |

### Output

| Format | Support |
| ------ | ------- |
| PNG    | Yes     |

PNG is the preferred carrier format because it preserves pixel values exactly.

---

# Payload Types

VEIL treats payloads as bytes rather than assuming everything is text.

This allows it to handle:

* Plain text
* JSON
* Images
* PDFs
* ZIP archives
* Audio
* Documents
* Other arbitrary files

The original filename and MIME type can be stored with the payload so extracted files can be reconstructed appropriately.

---

# Performance

VEIL prefers Web Workers for computationally expensive operations.

Potential worker tasks include:

* Pixel scanning
* LSB embedding
* LSB extraction
* Hashing
* Large payload processing

This prevents expensive operations from unnecessarily blocking the UI.

When workers are unavailable—particularly when the application is opened directly from `file://`—VEIL falls back to the same processing logic on the main thread.

No separate implementation of the algorithm is required.

---

# Running VEIL

VEIL has no build process.

The simplest option is to open:

```text
index.html
```

directly in a browser.

Because some browsers restrict Web Workers on `file://` origins, running VEIL through a local HTTP server provides the best experience.

For example, with Python:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

No package installation is required.

---

# Project Structure

The exact structure may vary depending on the implementation, but the application is intentionally kept simple:

```text
veil/
├── index.html
├── styles.css
├── app.js
├── ...
└── README.md
```

If the project is split into additional JavaScript files, each module has a focused responsibility rather than relying on a framework.

---

# Security Model

VEIL is a steganography utility, not an anonymity system.

### Protected when encryption is enabled

* Payload contents
* Stored filename
* MIME metadata
* Ciphertext integrity through AES-GCM authentication

### Hidden

* Payload from casual visual inspection

### Not protected

* Resistance to sophisticated statistical steganalysis
* Metadata outside the embedded payload
* The carrier's existence
* The fact that a file was transmitted
* Payload survival after image recompression
* Payload survival after resizing or re-encoding

### Not provided

* Anonymity
* Guaranteed forensic undetectability
* Protection against a compromised device
* Protection against a malicious or modified browser environment

Steganography is not magic.

A carrier that is resized, recompressed, filtered, or otherwise transformed may lose its embedded payload.

---

# Threat Model

VEIL is primarily designed for **local concealment and controlled data transport**, not for defeating advanced forensic analysis.

For example:

```text
Casual viewer
     │
     └── Sees an ordinary image

VEIL
     │
     └── Payload exists inside the image

Password protection
     │
     └── Payload contents remain encrypted

Advanced steganalysis
     │
     └── May detect statistical anomalies
```

The security properties therefore depend on both:

1. The cryptographic protection of the payload.
2. The steganographic properties of the carrier.

Encryption does not make steganography undetectable.

---

# Design Philosophy

VEIL intentionally avoids the typical "cybersecurity dashboard" aesthetic.

No:

* fake terminal effects
* matrix rain
* glowing shields
* meaningless security statistics
* excessive gradients
* decorative hacker imagery
* unnecessary animations

Instead, the interface is designed around the feeling of a **precision workstation**.

The visual language prioritizes:

* information density
* hierarchy
* typography
* technical metadata
* deliberate spacing
* restrained motion
* clear system states
* functional controls

The interface should feel like a tool rather than a marketing page.

---

# Browser APIs

VEIL relies on native browser capabilities wherever possible.

Relevant APIs include:

* Canvas API
* File API
* Blob API
* ArrayBuffer / TypedArray
* Web Crypto API
* Web Workers
* Drag and Drop API
* Clipboard API
* localStorage for non-sensitive preferences

No external cryptographic implementation is required.

---

# Browser Compatibility

VEIL requires a modern browser with support for:

* Canvas
* File APIs
* TypedArrays
* Web Crypto
* AES-GCM
* PBKDF2
* SHA-256

Web Worker support is recommended for larger images but is not required for basic operation.

If a browser prevents worker construction, VEIL automatically falls back to main-thread processing.

---

# Limitations

VEIL intentionally has boundaries.

### Lossy transformations

Do not resize, recompress, or convert an encoded image through a lossy pipeline.

### Capacity

Larger payloads require larger carrier images.

### Steganalysis

LSB steganography can potentially be detected by statistical analysis.

### Browser environment

Performance depends on the browser and available system resources.

### Memory

Large images and large payloads can require significant browser memory.

### Password strength

AES-GCM is only as resistant to password guessing as the password-derived key allows. Use a strong password.

---

# Responsible Use

VEIL is a general-purpose steganography and privacy tool.

Use it responsibly and only with files and systems you are authorized to use.

The project is intended for:

* privacy experimentation
* security education
* digital forensics research
* steganography research
* local file protection
* learning about browser cryptography
* legitimate data concealment

---

# Technical Summary

| Component           | Implementation                  |
| ------------------- | ------------------------------- |
| Language            | Vanilla JavaScript              |
| UI                  | HTML + CSS                      |
| Steganography       | LSB RGB                         |
| Carrier             | PNG / WebP / JPEG input         |
| Output              | PNG                             |
| Encryption          | AES-256-GCM                     |
| Key derivation      | PBKDF2-SHA256                   |
| PBKDF2 iterations   | 310,000                         |
| Salt                | 16 bytes                        |
| IV / nonce          | 12 bytes                        |
| Hashing             | SHA-256                         |
| Integrity           | CRC-32 + AES-GCM authentication |
| Randomness          | `crypto.getRandomValues()`      |
| Parallel processing | Web Worker when available       |
| Backend             | None                            |
| Dependencies        | None                            |
| Data upload         | None                            |

---

# The Short Version

**VEIL hides data inside images without sending the image anywhere.**

It combines:

```text
LOCAL PROCESSING
       +
LSB STEGANOGRAPHY
       +
AES-256-GCM
       +
BINARY PAYLOADS
       +
INTEGRITY CHECKING
       +
ROUND-TRIP VERIFICATION
```

Everything runs inside the browser.

**No backend.
No uploads.
No dependencies.
No bullshit.**

---

## License

Add the project's chosen license here.

For example:

```text
MIT License
```

if the repository is intended to be released under MIT.
