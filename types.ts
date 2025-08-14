export type ImageData = {
  src: string;
  caption?: string;
};

export type SlideshowConfig = {
  title: string;
  subtitle: string;
  images: ImageData[];
};
