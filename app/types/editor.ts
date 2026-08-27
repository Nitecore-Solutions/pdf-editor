export type ToolType =
  | 'select'
  | 'text'
  | 'links'
  | 'forms'
  | 'images'
  | 'sign'
  | 'whiteout'
  | 'annotate'
  | 'shapes';

export type AnnotateSubtool = 'pen' | 'highlighter' | 'eraser';
export type ShapeSubtool = 'rectangle' | 'circle' | 'line' | 'arrow';
export type FormSubtool = 'text' | 'checkbox' | 'radio';

export interface BaseElement {
  id: string;
  pageIndex: number;
  x: number; // in percentage of page width (0 to 100)
  y: number; // in percentage of page height (0 to 100)
  width: number;
  height: number;
  rotation?: number;
}

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontSize: number; // px
  fontFamily: string;
  color: string;
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  align: 'left' | 'center' | 'right';
}

export interface WhiteoutElement extends BaseElement {
  type: 'whiteout';
  color: string; // usually #FFFFFF
  borderColor?: string;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  dataUrl: string;
  originalWidth: number;
  originalHeight: number;
  aspectRatio: number;
}

export interface SignatureElement extends BaseElement {
  type: 'signature';
  dataUrl: string;
  sigType: 'draw' | 'type' | 'upload';
  color: string;
}

export interface ShapeElement extends BaseElement {
  type: 'shape';
  shapeType: ShapeSubtool;
  strokeColor: string;
  strokeWidth: number;
  fillColor: string; // 'transparent' or hex
  isFilled: boolean;
}

export interface DrawingPath {
  points: { x: number; y: number }[];
  color: string;
  width: number;
  opacity: number;
  isHighlighter?: boolean;
}

export interface DrawingElement extends BaseElement {
  type: 'drawing';
  paths: DrawingPath[];
}

export interface LinkElement extends BaseElement {
  type: 'link';
  url: string;
}

export interface FormElement extends BaseElement {
  type: 'form';
  formType: FormSubtool;
  value: string | boolean;
  name?: string;
  // Text styling (for text fields)
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  isBold?: boolean;
  isItalic?: boolean;
  placeholder?: string;
}

export type EditorElement =
  | TextElement
  | WhiteoutElement
  | ImageElement
  | SignatureElement
  | ShapeElement
  | DrawingElement
  | LinkElement
  | FormElement;

export interface PageInfo {
  pageIndex: number; // current sequential index (0, 1, 2...)
  originalPageIndex?: number; // index in original PDF buffer if applicable
  width: number;
  height: number;
  rotation: number; // 0, 90, 180, 270
  isNewBlank?: boolean;
}

export interface EditorState {
  file: File | null;
  fileName: string;
  pdfBytes: Uint8Array | null;
  numPages: number;
  pages: PageInfo[];
  elements: EditorElement[];
  selectedElementId: string | null;
  activeTool: ToolType;
  activeAnnotateSubtool: AnnotateSubtool;
  activeShapeSubtool: ShapeSubtool;
  activeFormSubtool: FormSubtool;
  zoom: number; // 0.5 to 2.0
  history: EditorElement[][];
  historyIndex: number;
}
