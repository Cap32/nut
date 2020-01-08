type TStyles = {
  numberWidth?: string;
  numberPadding?: string;
  numberColor?: string;
  numberBgColor?: string;
};

type TMeasure = {
  lineHeight: number;
  fontSize: number;
  paddingTop: number;
  paddingRight: number;
  nuWidth: number;
  nuPadding: number; // horizontal padding
};

enum EDataAttr {
  Width,
  Padding,
  Color,
  BgColor
}

const dataAttrsMap = new Map<EDataAttr, string>([
  [EDataAttr.Width, "data-nut-width"],
  [EDataAttr.Padding, "data-nut-padding"],
  [EDataAttr.Color, "data-nut-color"],
  [EDataAttr.BgColor, "data-nut-bg-color"]
]);

const dataAttrs = [...dataAttrsMap.values()];

const mutationStyleProps = [
  "paddingTop",
  "paddingRight",
  "lineHeight",
  "fontSize",
  "fontFamily"
];

function debounce(func: Function, wait: number, ctx: any) {
  let timeout: NodeJS.Timeout;
  return function() {
    clearTimeout(timeout);
    timeout = setTimeout(function() {
      func.call(ctx);
      timeout = null;
    }, wait);
  };
}

function getMeasure(css: CSSStyleDeclaration, styles: TStyles): TMeasure {
  const box = document.createElement("div");
  const { body } = document;
  box.setAttribute(
    "style",
    [
      `width: 0`,
      `margin: 0`,
      `padding: ${css.paddingTop} ${css.paddingRight} 0 0`,
      `font-family: ${css.fontFamily}`,
      `font-size: ${css.fontSize}`,
      `line-height: ${css.lineHeight}`
    ].join(";")
  );
  body.appendChild(box);
  const paddingTop = box.clientHeight;
  const paddingRight = box.clientWidth;
  box.style.paddingRight = styles.numberPadding;
  const nuPadding = box.clientWidth;
  box.style.padding = "0";
  box.style.width = styles.numberWidth;
  const nuWidth = box.clientWidth;
  box.innerHTML = "&nbsp;";
  const lineHeight = box.clientHeight;
  box.style.lineHeight = "1";
  const fontSize = box.clientHeight;
  body.removeChild(box);
  return { lineHeight, fontSize, paddingRight, paddingTop, nuWidth, nuPadding };
}

class StyleMutation {
  private prevStyle = new Map<string, string>();
  private prevData = new Map<string, string>();

  set(style: CSSStyleDeclaration, el: HTMLElement) {
    const { prevStyle, prevData } = this;
    for (const prop of mutationStyleProps) {
      prevStyle.set(prop, style[prop as any]);
    }
    for (const attr of dataAttrs) {
      prevData.set(attr, el.getAttribute(attr));
    }
  }

  styleDiff(style: CSSStyleDeclaration): boolean {
    let result = false;
    const { prevStyle } = this;
    for (const prop of mutationStyleProps) {
      const prevValue = prevStyle.get(prop);
      const value = style[prop as any];
      if (value != prevValue) {
        result = true;
        prevStyle.set(prop, value);
      }
    }
    return result;
  }

  dataDiff(el: HTMLElement): boolean {
    let result = false;
    const { prevData } = this;
    for (const attr of dataAttrs) {
      const prevValue = prevData.get(attr);
      const value = el.getAttribute(attr);
      if (value != prevValue) {
        result = true;
        prevData.set(attr, value);
      }
    }
    return result;
  }
}

class NuMutationObserver {
  static options: MutationObserverInit = {
    attributes: true,
    attributeFilter: ["style", ...dataAttrs]
  };

  private nuMap = new Map<Node, Nu>();
  private observer: MutationObserver;

  constructor() {
    this.observer = new MutationObserver(mutationsList => {
      for (const { attributeName, type, target } of mutationsList) {
        if (type != "attributes") continue;
        const nu = this.nuMap.get(target);
        if (!nu) continue;
        if (attributeName == "style") {
          if (nu.styleMutation.styleDiff(getComputedStyle(nu.el, null))) {
            nu.render();
          }
        } else if (nu.styleMutation.dataDiff(nu.el)) {
          nu.render();
        }
      }
    });
  }

  observe(nu: Nu) {
    const { el } = nu;
    this.nuMap.set(el, nu);
    this.observer.observe(el, NuMutationObserver.options);
  }
}

class NuResizeObserver {
  private nuMap = new Map<Node, Nu>();
  private observer: ResizeObserver;

  constructor() {
    this.observer = new ResizeObserver(entries => {
      for (const { target } of entries) {
        const nu = this.nuMap.get(target);
        if (nu) nu.render();
      }
    });
  }

  observe(nu: Nu) {
    const { el } = nu;
    this.nuMap.set(el, nu);
    this.observer.observe(el);
  }
}

const nuMutationObserver = new NuMutationObserver();
const nuResizeObserver = new NuResizeObserver();

class Nu {
  el: HTMLTextAreaElement;
  styleMutation: StyleMutation;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private styles: TStyles;
  private dpr: number;

  constructor(el: HTMLTextAreaElement, styles?: TStyles) {
    this.el = el;
    this.styles = styles;
    const canvas = document.createElement("canvas");
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    this.dpr = dpr;
    this.styles = styles;
    this.canvas = canvas;
    this.ctx = ctx;
    this.styleMutation = new StyleMutation();
  }

  private getAttr(attr: EDataAttr, defaultValue: string): string {
    return this.el.getAttribute(dataAttrsMap.get(attr)) || defaultValue;
  }

  private ensureStyles(): TStyles {
    if (!this.styles) this.styles = {};
    return {
      numberPadding: this.getAttr(EDataAttr.Padding, "8px"),
      numberWidth: this.getAttr(EDataAttr.Width, "64px"),
      numberColor: this.getAttr(EDataAttr.Color, "#666"),
      numberBgColor: this.getAttr(EDataAttr.BgColor, "#f4f4f4"),
      ...this.styles
    };
  }

  watch() {
    this.el.addEventListener("input", this.render);
    nuResizeObserver.observe(this);
    nuMutationObserver.observe(this);
  }

  private setStyle(mesaure: TMeasure, dataURL: string) {
    const { nuWidth, paddingRight } = mesaure;
    const css = [
      /* NOTE: paddingLeft is always equal paddingRight */
      `padding-left: ${nuWidth + paddingRight}px`,

      "box-sizing: border-box",
      "background-repeat: no-repeat",
      "background-attachment: local",
      `background-size: ${nuWidth}px auto`,
      `background-image: url(${dataURL})`
    ];
    this.el.style.cssText += css.join(";");
  }

  private drawLine(
    measure: TMeasure,
    index: number,
    lineHeight: number,
    fontSize: number
  ) {
    const { ctx, canvas, dpr } = this;
    const { paddingTop, nuPadding } = measure;
    const x = canvas.width - nuPadding * dpr * 2;
    const y =
      paddingTop * dpr + lineHeight * index + (lineHeight + fontSize) / 2;
    ctx.fillText((index + 1).toString(), x, y);
  }

  private handleRender() {
    const { el, ctx, canvas, dpr } = this;
    const css = getComputedStyle(el, null);
    const styles = this.ensureStyles();
    const measure = getMeasure(css, styles);
    const { scrollHeight } = el;
    this.styleMutation.set(css, el);
    canvas.width = measure.nuWidth * dpr;
    canvas.height = scrollHeight * dpr;
    ctx.fillStyle = styles.numberBgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = styles.numberColor;
    ctx.textAlign = "end";
    const fontSizeDPR = measure.fontSize * dpr;
    const fontSize = fontSizeDPR + "px";
    const lineHeightDPR = measure.lineHeight * dpr;
    ctx.font = `${fontSize} ${css.fontFamily}`;
    const lines = Math.ceil(scrollHeight / measure.lineHeight);
    for (let index = 0; index < lines; index++) {
      this.drawLine(measure, index, lineHeightDPR, fontSizeDPR);
    }

    /* NOTE: canvas.toBlob() is slower then canvas.toDataURL() */
    // canvas.toBlob(blob => this.setStyle(URL.createObjectURL(blob)));
    this.setStyle(measure, canvas.toDataURL());
  }

  /* NOTE: using arrow function to make sure `this` is a Nu instance */
  render = debounce(this.handleRender, 20, this);
}

function nut(el: HTMLTextAreaElement, styles?: TStyles) {
  const nu = new Nu(el, styles);
  nu.watch();
}

function init() {
  const els = document.querySelectorAll<HTMLTextAreaElement>(".nut");
  els.forEach(el => nut(el));
}

init();

export default nut;
