// ─────────────────────────────────────────────────────────────────────────────
//  Utils
// ─────────────────────────────────────────────────────────────────────────────
function isPowerOf2(value) {
  return (value & (value - 1)) === 0;
}

// Pequeña versión de mat4 (solo lo necesario)
export const mat4 = {
  create() {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  },
  identity(o) {
    o.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  },
  lookAt(out, eye, center, up) {
    const x = new Float32Array(3);
    const y = new Float32Array(3);
    const z = new Float32Array(3);
  
    // Vector z = eye - center
    z[0] = eye[0] - center[0];
    z[1] = eye[1] - center[1];
    z[2] = eye[2] - center[2];
    let len = Math.hypot(z[0], z[1], z[2]);
    if (len === 0) {
      z[2] = 1;
    } else {
      z[0] /= len; z[1] /= len; z[2] /= len;
    }
  
    // Vector x = up × z
    x[0] = up[1] * z[2] - up[2] * z[1];
    x[1] = up[2] * z[0] - up[0] * z[2];
    x[2] = up[0] * z[1] - up[1] * z[0];
    len = Math.hypot(x[0], x[1], x[2]);
    if (len === 0) {
      // up and z are parallel
      if (Math.abs(up[2]) === 1) {
        z[0] += 0.0001;
      } else {
        z[2] += 0.0001;
      }
      x[0] = up[1] * z[2] - up[2] * z[1];
      x[1] = up[2] * z[0] - up[0] * z[2];
      x[2] = up[0] * z[1] - up[1] * z[0];
      len = Math.hypot(x[0], x[1], x[2]);
    }
    x[0] /= len; x[1] /= len; x[2] /= len;
  
    // Vector y = z × x
    y[0] = z[1] * x[2] - z[2] * x[1];
    y[1] = z[2] * x[0] - z[0] * x[2];
    y[2] = z[0] * x[1] - z[1] * x[0];
  
    out[0] = x[0];
    out[1] = y[0];
    out[2] = z[0];
    out[3] = 0;
    out[4] = x[1];
    out[5] = y[1];
    out[6] = z[1];
    out[7] = 0;
    out[8] = x[2];
    out[9] = y[2];
    out[10] = z[2];
    out[11] = 0;
    out[12] = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]);
    out[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]);
    out[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]);
    out[15] = 1;
  },  
  perspective(o, fovy, asp, near, far) {
    const f = 1 / Math.tan(fovy / 2),
      nf = 1 / (near - far);
    o[0] = f / asp;
    o[1] = o[2] = o[3] = 0;
    o[4] = 0;
    o[5] = f;
    o[6] = o[7] = 0;
    o[8] = 0;
    o[9] = 0;
    o[10] = (far + near) * nf;
    o[11] = -1;
    o[12] = 0;
    o[13] = 0;
    o[14] = 2 * far * near * nf;
    o[15] = 0;
  },
  translate(o, a, v) {
    const [x, y, z] = v;
    if (a === o) {
      o[12] += a[0] * x + a[4] * y + a[8] * z;
      o[13] += a[1] * x + a[5] * y + a[9] * z;
      o[14] += a[2] * x + a[6] * y + a[10] * z;
      o[15] += a[3] * x + a[7] * y + a[11] * z;
    } else {
      const a00 = a[0],
        a01 = a[1],
        a02 = a[2],
        a03 = a[3],
        a10 = a[4],
        a11 = a[5],
        a12 = a[6],
        a13 = a[7],
        a20 = a[8],
        a21 = a[9],
        a22 = a[10],
        a23 = a[11];
      o[0] = a00;
      o[1] = a01;
      o[2] = a02;
      o[3] = a03;
      o[4] = a10;
      o[5] = a11;
      o[6] = a12;
      o[7] = a13;
      o[8] = a20;
      o[9] = a21;
      o[10] = a22;
      o[11] = a23;
      o[12] = a00 * x + a10 * y + a20 * z + a[12];
      o[13] = a01 * x + a11 * y + a21 * z + a[13];
      o[14] = a02 * x + a12 * y + a22 * z + a[14];
      o[15] = a03 * x + a13 * y + a23 * z + a[15];
    }
  },
  rotate(o, a, rad, axis) {
    let [x, y, z] = axis;
    let len = Math.hypot(x, y, z);
    if (len < 1e-6) return;
    len = 1 / len;
    x *= len;
    y *= len;
    z *= len;
    const s = Math.sin(rad),
      c = Math.cos(rad),
      t = 1 - c,
      a00 = a[0],
      a01 = a[1],
      a02 = a[2],
      a03 = a[3],
      a10 = a[4],
      a11 = a[5],
      a12 = a[6],
      a13 = a[7],
      a20 = a[8],
      a21 = a[9],
      a22 = a[10],
      a23 = a[11];
    const b00 = x * x * t + c,
      b01 = y * x * t + z * s,
      b02 = z * x * t - y * s,
      b10 = x * y * t - z * s,
      b11 = y * y * t + c,
      b12 = z * y * t + x * s,
      b20 = x * z * t + y * s,
      b21 = y * z * t - x * s,
      b22 = z * z * t + c;
    o[0] = a00 * b00 + a10 * b01 + a20 * b02;
    o[1] = a01 * b00 + a11 * b01 + a21 * b02;
    o[2] = a02 * b00 + a12 * b01 + a22 * b02;
    o[3] = a03 * b00 + a13 * b01 + a23 * b02;
    o[4] = a00 * b10 + a10 * b11 + a20 * b12;
    o[5] = a01 * b10 + a11 * b11 + a21 * b12;
    o[6] = a02 * b10 + a12 * b11 + a22 * b12;
    o[7] = a03 * b10 + a13 * b11 + a23 * b12;
    o[8] = a00 * b20 + a10 * b21 + a20 * b22;
    o[9] = a01 * b20 + a11 * b21 + a21 * b22;
    o[10] = a02 * b20 + a12 * b21 + a22 * b22;
    o[11] = a03 * b20 + a13 * b21 + a23 * b22;
    o[12] = a[12];
    o[13] = a[13];
    o[14] = a[14];
    o[15] = a[15];
  },
};
