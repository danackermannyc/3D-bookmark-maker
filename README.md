# 3D-bookmark-maker
Take any image and turn it into a multi-color bookmark .3mf or .stl file for 3D printing. Works with BambuStudio and Bambu AMS. 

# 📚 Multi-Color 3D Bookmark Creator

![Version](https://img.shields.io/badge/version-1.2.1-emerald)
![License](https://img.shields.io/badge/license-MIT-blue)
![React](https://img.shields.io/badge/built%20with-React%20%26%20TypeScript-blueviolet)

A web application designed for **Bambu Lab A1/P1/X1** owners with AMS (Automatic Material System). It converts 2D images into multi-layered, 4-color 3D printable bookmarks using optimized mesh generation and color quantization.

## ✨ Features

- **Auto-Quantization:** Automatically reduces any image to a 4-color palette using K-Means clustering.
- **Smart 3MF Export (New in v1.2):**
  - Generates a single `.3mf` project file.
  - **Auto-Color Mapping:** Parts are pre-assigned RGB values, so they show up colored in Bambu Studio immediately.
  - **Embedded Thumbnails:** See a preview of your bookmark in your OS or slicer file dialog.
  - **Named Objects:** Layers are clearly named (e.g., `Layer_1_Base_FF0000`) for easy identification.
- **Two Printing Modes:**
  - **Tactile 2.5D:** Varied layer heights create a textured surface.
  - **Flat Multi-color:** Uniform layer thickness for a smooth top surface (perfect for ironing).
- **Client-Side Processing:** fast image processing performed locally in the browser.

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- NPM or Yarn
- A Google Gemini API Key (Required for AI pattern generation features)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/bambu-bookmark-creator.git
   cd bambu-bookmark-creator
