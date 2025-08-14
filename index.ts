import * as Fs from "fs";
import * as Types from "./types";
import * as Data from "./data";

import PDFDocument from "pdfkit";
import Sharp from "sharp";

const MARGIN = 72; // Margin around images in points (1 inch = 72 points)
const PAGE_WIDTH = 1920;
const PAGE_HEIGHT = 1080;
const CAPTION_FONT_SIZE = 26;
const TITLE_FONT_SIZE = 48;
const FONT = "Helvetica";

/**
 * Get image dimensions using sharp
 */
const getImageDimensions = async (imagePath: string): Promise<ImageDimensions | null> => {
  try {
    const metadata = await Sharp(imagePath).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error("Could not read image dimensions");
    }
    return {
      width: metadata.width,
      height: metadata.height,
    };
  } catch (error) {
    console.error(`Error reading image ${imagePath}:`, error);
    return null;
  }
};

type ImageDimensions = {
  width: number;
  height: number;
};

/**
 * Calculate image size to fit within bounds while maintaining aspect ratio
 */
const calculateImageSize = (
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number
): ImageDimensions => {
  const widthRatio = maxWidth / originalWidth;
  const heightRatio = maxHeight / originalHeight;
  const scaleFactor = Math.min(widthRatio, heightRatio);

  return {
    width: originalWidth * scaleFactor,
    height: originalHeight * scaleFactor,
  };
};

/**
 * Add a title slide to the PDF
 */
const addTitleSlide = (
  doc: InstanceType<typeof PDFDocument>,
  title: string,
  subtitle?: string
): void => {
  const availableWidth = PAGE_WIDTH - 2 * MARGIN;
  const centerX = PAGE_WIDTH / 2;
  const centerY = PAGE_HEIGHT / 2;

  // Calculate vertical positioning based on whether subtitle exists
  const titleY = subtitle ? centerY - 80 : centerY - 50;
  const subtitleY = centerY - 20;

  // Set font and add title
  doc.fontSize(TITLE_FONT_SIZE).font(FONT).text(title, MARGIN, titleY, {
    width: availableWidth,
    align: "center",
  });

  // Add subtitle if provided
  if (subtitle) {
    doc.fontSize(TITLE_FONT_SIZE).font(FONT).text(subtitle, MARGIN, subtitleY, {
      width: availableWidth,
      align: "center",
    });
  }
};

/**
 * Add an image slide to the PDF
 */
const addImageSlide = async (
  doc: InstanceType<typeof PDFDocument>,
  imageData: Types.ImageData
): Promise<void> => {
  try {
    // Get image dimensions
    const dimensions = await getImageDimensions(imageData.src);
    if (!dimensions) {
      throw new Error(`Could not get dimensions for ${imageData.src}`);
    }

    // Calculate available space
    const availableWidth = PAGE_WIDTH - 2 * MARGIN;
    let availableHeight = PAGE_HEIGHT - 2 * MARGIN;

    // Always reserve space for caption to keep images in consistent position
    const captionHeight = 80; // Fixed spacing for consistent positioning
    availableHeight -= captionHeight;

    // Use PDFKit's fit option to maintain aspect ratio and center the image
    const imageX = MARGIN;
    const imageY = MARGIN;

    // Add the image using PDFKit's fit option to guarantee aspect ratio preservation
    doc.image(imageData.src, imageX, imageY, {
      fit: [availableWidth, availableHeight],
      align: "center",
      valign: "center",
    });

    // Calculate actual image size for caption positioning
    const imageSize = calculateImageSize(
      dimensions.width,
      dimensions.height,
      availableWidth,
      availableHeight
    );

    // Add caption if provided
    if (imageData.caption) {
      const captionY = imageY + imageSize.height + 30;
      doc.fontSize(CAPTION_FONT_SIZE).font(FONT).text(imageData.caption, MARGIN, captionY, {
        width: availableWidth,
        align: "center",
      });
    }
  } catch (error) {
    console.error(`Error adding image slide for ${imageData.src}:`, error);
  }
};

/**
 * Create the PDF slideshow
 */
async function createPdfSlideshow(
  config: Types.SlideshowConfig,
  outputFilename: string
): Promise<boolean> {
  try {
    // Create PDF document
    const doc = new PDFDocument({
      size: [PAGE_WIDTH, PAGE_HEIGHT],
      margin: MARGIN,
    });

    // Create output stream
    const stream = Fs.createWriteStream(`./dist/${outputFilename}`);
    doc.pipe(stream);

    // Add title slide as first slide
    if (config.title) {
      addTitleSlide(doc, config.title, config.subtitle);
      doc.addPage();
    }

    // Process each image
    for (let i = 0; i < config.images.length; i++) {
      const imageData = config.images[i];
      if (!imageData) {
        console.warn(`Warning: Image data at index ${i} is undefined, skipping`);
        continue;
      }

      // Check if image file exists
      if (!Fs.existsSync(imageData.src)) {
        console.warn(`Warning: Image ${imageData.src} not found, skipping`);
        continue;
      }

      // Add image slide
      await addImageSlide(doc, imageData);

      // Add new page if not the last image
      if (i < config.images.length - 1) {
        doc.addPage();
      }
    }

    // Finalize the PDF
    doc.end();

    // Wait for the stream to finish
    await new Promise<void>((resolve, reject) => {
      stream.on("finish", resolve);
      stream.on("error", reject);
    });

    console.log(`PDF created successfully: ${outputFilename}`);
    return true;
  } catch (error) {
    console.error("Error creating PDF:", error);
    return false;
  }
}

/**
 * Generate timestamp string
 */
const getTimestamp = () => {
  const now = new Date();
  return (
    now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, "0") +
    now.getDate().toString().padStart(2, "0") +
    "_" +
    now.getHours().toString().padStart(2, "0") +
    now.getMinutes().toString().padStart(2, "0") +
    now.getSeconds().toString().padStart(2, "0")
  );
};

/**
 * Main function
 */
const main = async () => {
  console.log("PDF Slideshow Generator (TypeScript/Bun)");
  console.log("========================================");

  // Validate configuration
  if (!Data.SLIDESHOW.images || Data.SLIDESHOW.images.length === 0) {
    console.error("No images found in configuration");
    process.exit(1);
  }

  // Generate output filename with timestamp
  const timestamp = getTimestamp();
  const baseName = Data.SLIDESHOW.title?.replace(/[^a-zA-Z0-9]/g, "_") || "slideshow";
  const outputFilename = `${baseName}_${timestamp}.pdf`;

  console.log(`Title: ${Data.SLIDESHOW.title || "No title"}`);
  if (Data.SLIDESHOW.subtitle) {
    console.log(`Subtitle: ${Data.SLIDESHOW.subtitle}`);
  }
  console.log(`Images to process: ${Data.SLIDESHOW.images.length}`);
  console.log(`Output file: ${outputFilename}`);
  console.log("");

  // Create the slideshow
  const success = await createPdfSlideshow(Data.SLIDESHOW, outputFilename);

  if (success) {
    console.log("\n✅ Slideshow generated successfully!");
    console.log(`📁 File: ${outputFilename}`);
    console.log(`🖼️  Images processed: ${Data.SLIDESHOW.images.length}`);
    if (Data.SLIDESHOW.title) {
      console.log(`📄 Title slide included`);
    }
  } else {
    console.log("\n❌ Failed to generate slideshow");
    process.exit(1);
  }
};

main().catch(console.error);
