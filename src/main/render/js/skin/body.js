import { mat4 } from "./mat4.js";
import { showNotification } from "../global/Notification.js";

export class BodyModel {
  constructor(c, skin, walking = false) {
    this.c = c;
    const dpr = window.devicePixelRatio || 1;

    // Dimensiones visibles
    let width = c.clientWidth;
    let height = c.clientHeight;

    // Si el canvas está oculto (por ejemplo, display: none), asigna tamaño temporal
    if (width === 0 || height === 0) {
      width = 300; // tamaño seguro por defecto
      height = 300;
      c.style.width = width + "px";
      c.style.height = height + "px";
    }

    c.width = width * dpr;
    c.height = height * dpr;
    c.style.width = width + "px";
    c.style.height = height + "px";
    
    this.gl = c.getContext("webgl", { antialias: false });
    if (!this.gl) return showNotification({type: "accepted",text:"WebGL Desactivado"});

    this.grid = this._createGrid(40, 40);
    this.gl.disable(this.gl.SAMPLE_COVERAGE);
    this.gl.disable(this.gl.SAMPLE_ALPHA_TO_COVERAGE);
    this.gl.viewport(0, 0, c.width, c.height);

    this.rotX = 0;
    this.rotY = 0;
    this.rotZ = 0;
    this.panX = 0;
    this.panY = 0;
    this.zoom = 0;
    this.drag = false;
    this.btn = 0;
    this.lastX = 0;
    this.lastY = 0;
    this.walking = walking;

    c.onmousedown = (e) => {
      this.drag = true;
      this.btn = e.button;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    };
    c.style.imageRendering = "none";
    window.onmouseup = () => (this.drag = false);
    window.onmousemove = (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      const pan = this.btn === 2 || (this.btn === 0 && e.shiftKey);
      if (pan) {
        this.panX += dx * 0.05;
        this.panY -= dy * 0.05;
      } else {
        this.rotY += dx * 0.01;
        this.rotX += dy * 0.01;
        const maxX = Math.PI / 2;
        if (this.rotX > maxX) this.rotX = maxX;
        else if (this.rotX < -maxX) this.rotX = -maxX;
      }
      this._draw();
    };
    c.onwheel = (e) => {
      this.zoom += e.deltaY * 0.05;
      this._draw();
    };

    this._initGL();
    this._initGridGL();

    this._loadTexture(skin).then((tex) => {
      this.tex = tex;
      this._draw();
    });

    if (this.walking) this._animate();
  }

  _animate() {
    this.rotY += 0.01;
    this._draw();
    requestAnimationFrame(() => this._animate());
  }

  // ------------------ SHADERS Y PROGRAMAS ------------------

  _initGL() {
    const g = this.gl;
    // Programa principal para cuerpo/partes con textura
    const vs = `
      attribute vec3 aPos; attribute vec2 aUV;
      uniform mat4 uM,uV;
      varying vec2 vUV;
      void main() {
        vUV = aUV;
        gl_Position = uV * uM * vec4(aPos,1.0);
      }`;
    const fs = `
      precision mediump float;
      uniform sampler2D uTex;
      varying vec2 vUV;
      void main() {
        vec4 c = texture2D(uTex,vUV);
        if(c.a < 0.1) discard;
        gl_FragColor = c;
      }`;
    this.program = this._createProgram(vs, fs);
    this.loc = {
      aPos: g.getAttribLocation(this.program, "aPos"),
      aUV: g.getAttribLocation(this.program, "aUV"),
      uM: g.getUniformLocation(this.program, "uM"),
      uV: g.getUniformLocation(this.program, "uV"),
      uTex: g.getUniformLocation(this.program, "uTex"),
    };
    g.enableVertexAttribArray(this.loc.aPos);
    g.enableVertexAttribArray(this.loc.aUV);
    this.parts = this._createParts();
  }

  _initGridGL() {
    const g = this.gl;
    // Programa para el grid de líneas (sin textura)
    const vsLine = `
      attribute vec3 aPos;
      uniform mat4 uM,uV;
      void main() {
        gl_Position = uV * uM * vec4(aPos, 1.0);
      }`;
    const fsLine = `
      precision mediump float;
      void main() {
        gl_FragColor = vec4(0.5, 0.5, 0.5, 1.0);
      }`;
    this.lineProgram = this._createProgram(vsLine, fsLine);
    this.locLine = {
      aPos: g.getAttribLocation(this.lineProgram, "aPos"),
      uM: g.getUniformLocation(this.lineProgram, "uM"),
      uV: g.getUniformLocation(this.lineProgram, "uV"),
    };
  }

  _createProgram(vsSource, fsSource) {
    const g = this.gl;
    const compile = (src, type) => {
      const s = g.createShader(type);
      g.shaderSource(s, src);
      g.compileShader(s);
      if (!g.getShaderParameter(s, g.COMPILE_STATUS))
        throw g.getShaderInfoLog(s);
      return s;
    };
    const prog = g.createProgram();
    g.attachShader(prog, compile(vsSource, g.VERTEX_SHADER));
    g.attachShader(prog, compile(fsSource, g.FRAGMENT_SHADER));
    g.linkProgram(prog);
    if (!g.getProgramParameter(prog, g.LINK_STATUS))
      throw g.getProgramInfoLog(prog);
    return prog;
  }

  // ------------------ CREAR PARTES DEL PERSONAJE ------------------

  _createParts() {
    const g = this.gl;
    const PX = 1 / 64;
    const UV = (x, y, w, h) =>
      [x, y + h, x + w, y + h, x + w, y, x, y].map((v) => v * PX);
    const faces = (f, b, l, r, t, bo) => [].concat(f, b, l, r, t, bo);
    const cube = (x, y, z, w, h, d, uvs) => {
      const p = [
        x,
        y,
        z + d,
        x + w,
        y,
        z + d,
        x + w,
        y + h,
        z + d,
        x,
        y + h,
        z + d,
        x + w,
        y,
        z,
        x,
        y,
        z,
        x,
        y + h,
        z,
        x + w,
        y + h,
        z,
        x,
        y,
        z,
        x,
        y,
        z + d,
        x,
        y + h,
        z + d,
        x,
        y + h,
        z,
        x + w,
        y,
        z + d,
        x + w,
        y,
        z,
        x + w,
        y + h,
        z,
        x + w,
        y + h,
        z + d,
        x,
        y + h,
        z + d,
        x + w,
        y + h,
        z + d,
        x + w,
        y + h,
        z,
        x,
        y + h,
        z,
        x,
        y,
        z,
        x + w,
        y,
        z,
        x + w,
        y,
        z + d,
        x,
        y,
        z + d,
      ];
      const idx = Array(6)
        .fill()
        .flatMap((_, i) => [0, 1, 2, 0, 2, 3].map((v) => v + i * 4));
      const pos = g.createBuffer();
      g.bindBuffer(g.ARRAY_BUFFER, pos);
      g.bufferData(g.ARRAY_BUFFER, new Float32Array(p), g.STATIC_DRAW);
      const uv = g.createBuffer();
      g.bindBuffer(g.ARRAY_BUFFER, uv);
      g.bufferData(
        g.ARRAY_BUFFER,
        new Float32Array(faces(...uvs)),
        g.STATIC_DRAW
      );
      const i = g.createBuffer();
      g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, i);
      g.bufferData(g.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), g.STATIC_DRAW);
      return { pos, uv, idx: i, count: idx.length };
    };

    const ox = 80;

    return [
      cube(-4, 24, -4, 8, 8, 8, [
        // Cabeza
        UV(8, 8, 8, 8),
        UV(24, 8, 8, 8),
        UV(0, 8, 8, 8),
        UV(16, 8, 8, 8),
        UV(8, 0, 8, 8),
        UV(16, 0, 8, 8),
      ]),
      cube(-4.5, 23.5, -4.5, 9, 9, 9, [
        // Capa externa cabeza
        UV(40, 8, 8, 8),
        UV(56, 8, 8, 8),
        UV(32, 8, 8, 8),
        UV(48, 8, 8, 8),
        UV(40, 0, 8, 8),
        UV(48, 0, 8, 8),
      ]),
      cube(-4, 12, -2, 8, 12, 4, [
        // Torso
        UV(20, 20, 8, 12),
        UV(32, 20, 8, 12),
        UV(16, 20, 4, 12),
        UV(28, 20, 4, 12),
        UV(20, 16, 8, 4),
        UV(28, 16, 8, 4),
      ]),
      cube(-4.5, 11.5, -2.5, 9, 13, 5, [
        // Capa externa torso
        UV(20, 36, 8, 12),
        UV(32, 36, 8, 12),
        UV(16, 36, 4, 12),
        UV(28, 36, 4, 12),
        UV(20, 32, 8, 4),
        UV(28, 32, 8, 4),
      ]),

      cube(-8, 12, -2, 4, 12, 4, [
        // Brazo izquierdo (original)
        UV(44, 20, 4, 12), // Frontal
        UV(48, 20, 4, 12), // Trasera
        UV(40, 20, 4, 12), // Izquierda
        UV(48, 20, 4, 12), // Derecha (lado visible)

        UV(44, 16, 4, 4), // Inferior (abajo del brazo)
        UV(47, 16, 4, 4), // Superior (hombro del brazo)
      ]),
      cube(-8.5, 11.5, -2.5, 5, 13, 5, [
        // Capa externa brazo izquierdo (original)
        UV(44, 36, 4, 12), // Frontal
        UV(52, 36, 4, 12), // Trasera
        UV(40, 36, 4, 12), // Izquierda
        UV(48, 36, 4, 12), // Derecha
      ]),
      cube(-4, 0, -2, 4, 12, 4, [
        // Pierna izquierda (original)
        UV(4, 20, 4, 12),
        UV(12, 20, 4, 12),
        UV(0, 20, 4, 12),
        UV(8, 20, 4, 12),
        UV(4, 16, 4, 4),
        UV(8, 16, 4, 4),
      ]),
      cube(-4.5, -0.5, -2.5, 5, 13, 5, [
        // Capa externa pierna izquierda (original)
        UV(4, 36, 4, 12),
        UV(12, 36, 4, 12),
        UV(0, 36, 4, 12),
        UV(8, 36, 4, 12),
        UV(4, 32, 4, 4),
        UV(8, 32, 4, 4),
      ]),

      // Duplicados para lado derecho (posición y UVs invertidas y correctas):

      cube(4, 12, -2, 4, 12, 4, [
        // Brazo derecho (duplicado)
        UV(36, 52, 4, 12), // Frontal (brazo derecho)
        UV(40, 52, 4, 12), // Trasera
        UV(32, 52, 4, 12), // Izquierda
        UV(40, 52, 4, 12), // Derecha (visible)
        UV(40, 52, 4, 4), // Inferior (abajo del brazo)
        UV(37, 48, 4, 4), // Superior (hombro del brazo)
      ]),
      cube(4.5, 11.5, -2.5, 5, 13, 5, [
        // Capa externa brazo derecho (duplicado)
        UV(36, 68, 4, 12), // Frontal
        UV(44, 68, 4, 12), // Trasera
        UV(32, 68, 4, 12), // Izquierda
        UV(40, 68, 4, 12), // Derecha
        UV(55, 12, 4, 4), // Inferior (abajo del brazo)
        UV(57, 48, 4, 4), // Superior (hombro del brazo)
      ]),
      // Cubo interno 4 × 12 × 4
      cube(0, 0, -2, 4, 12, 4, [
        UV(20, 52, 4, 12), // Frontal
        UV(28, 52, 4, 12), // Trasera
        UV(8, 52, 4, 12), // Izquierda (lado interno)
        UV(24, 52, 4, 12), // Derecha (lado visible exterior)
        UV(4, 48, 4, 4), // Inferior
        UV(8, 48, 4, 4), // Superior
      ]),

      // Cubo externo (segunda capa) 5 × 13 × 5
      cube(-0.5, -0.5, -2.5, 5, 13, 5, [
        UV(4, 52, 4, 12), // Frontal capa‑2
        UV(12, 52, 4, 12), // Trasera
        UV(8, 36, 4, 12), // Izquierda
        UV(8, 52, 4, 12), // Derecha
        UV(4, 32, 4, 4), // Abajo
        UV(8, 32, 4, 4), // Arriba
      ]),
    ];
    
  }

  // ------------------ CREAR GRID ------------------

  _createGrid(size = 20, divisions = 20) {
    const g = this.gl;
    const lines = [];

    const step = size / divisions;
    const half = size / 2;

    for (let i = 0; i <= divisions; i++) {
      const pos = -half + i * step;
      // líneas paralelas al eje X (variando Z)
      lines.push(-half, 0, pos, half, 0, pos);
      // líneas paralelas al eje Z (variando X)
      lines.push(pos, 0, -half, pos, 0, half);
    }

    const lineBuffer = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, lineBuffer);
    g.bufferData(g.ARRAY_BUFFER, new Float32Array(lines), g.STATIC_DRAW);

    return { buffer: lineBuffer, count: lines.length / 3 };
  }

  // ------------------ DIBUJAR ------------------

  _draw() {
    const g = this.gl;
    g.clearColor(0, 0, 0,0);
    g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT);

    const mv = mat4.create();
    const pr = mat4.create();
    mat4.perspective(pr, Math.PI / 2.5, this.c.width / this.c.height, 0.1, 100);

    mat4.translate(mv, mv, [this.panX, -20 + this.panY, -35 + this.zoom]);
    mat4.rotate(mv, mv, this.rotX, [1, 0, 0]);
    mat4.rotate(mv, mv, this.rotY, [0, 1, 0]);
    mat4.rotate(mv, mv, this.rotZ, [0, 0, 1]);

    // Dibujo del grid primero, para que quede detrás
    this._drawGrid(mv, pr);

    // Dibujo del personaje
    g.useProgram(this.program);
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, this.tex);
    g.uniform1i(this.loc.uTex, 0);
    g.enable(g.DEPTH_TEST);
    g.enable(g.CULL_FACE);

    for (const p of this.parts) {
      g.bindBuffer(g.ARRAY_BUFFER, p.pos);
      g.vertexAttribPointer(this.loc.aPos, 3, g.FLOAT, false, 0, 0);
      g.bindBuffer(g.ARRAY_BUFFER, p.uv);
      g.vertexAttribPointer(this.loc.aUV, 2, g.FLOAT, false, 0, 0);
      g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, p.idx);
      g.uniformMatrix4fv(this.loc.uM, false, mv);
      g.uniformMatrix4fv(this.loc.uV, false, pr);
      g.drawElements(g.TRIANGLES, p.count, g.UNSIGNED_SHORT, 0);
    }
  }

  _drawGrid(mv, pr) {
    const g = this.gl;
    g.useProgram(this.lineProgram);
    g.bindBuffer(g.ARRAY_BUFFER, this.grid.buffer);
    g.enableVertexAttribArray(this.locLine.aPos);
    g.vertexAttribPointer(this.locLine.aPos, 3, g.FLOAT, false, 0, 0);
    g.uniformMatrix4fv(this.locLine.uM, false, mv);
    g.uniformMatrix4fv(this.locLine.uV, false, pr);
    g.drawArrays(g.LINES, 0, this.grid.count);
  }

  async _loadTexture(url) {
    const g = this.gl;
    const img = new Image();
    img.crossOrigin = "";
    img.src = url;
    await img.decode();
    const tex = g.createTexture();
    g.bindTexture(g.TEXTURE_2D, tex);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, img);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST);
    return tex;
  }
}
