
const motionCache = new Map();

function folderOf(url) {
  return url.slice(0, url.lastIndexOf('/') + 1);
}

function objIndex(value, length) {
  const parsed = Number(value);
  return parsed < 0 ? length + parsed : parsed - 1;
}

function materialFor(creator, name) {
  if (name && creator) {
    const material = creator.create(name);
    if (material) return material;
  }
  return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
}

function parseObj(text, creator, excludedFaces = {}) {
  const sourcePositions = [];
  const sourceUvs = [];
  const sourceNormals = [];
  const positions = [];
  const uvs = [];
  const normals = [];
  const sourceIndices = [];
  const indices = [];
  const cornerMap = new Map();
  const groups = [];
  const sourceFaceIndexes = new Map();
  const excludedByMaterial = new Map(Object.entries(excludedFaces).map(
    ([name, values]) => [name, new Set(values.map(Number))],
  ));
  let currentMaterial = '';
  let groupStart = 0;

  function hasCollapsedEdge(a, b, c) {
    const ids = [a, b, c];
    let minimumSquared = Number.POSITIVE_INFINITY;
    for (const [left, right] of [[0, 1], [1, 2], [2, 0]]) {
      const leftOffset = ids[left] * 3;
      const rightOffset = ids[right] * 3;
      const dx = positions[leftOffset] - positions[rightOffset];
      const dy = positions[leftOffset + 1] - positions[rightOffset + 1];
      const dz = positions[leftOffset + 2] - positions[rightOffset + 2];
      minimumSquared = Math.min(minimumSquared, dx * dx + dy * dy + dz * dz);
    }
    // GMDL exports occasionally contain a face whose two vertices are only
    // a few ten-thousandths apart. Its normal becomes numerically unstable
    // after skinning and appears as a flashing sliver. It has no visible area.
    return minimumSquared < 1e-8;
  }

  function closeGroup() {
    if (indices.length > groupStart) {
      groups.push({ name: currentMaterial, start: groupStart, count: indices.length - groupStart });
      groupStart = indices.length;
    }
  }

  function corner(token) {
    if (cornerMap.has(token)) return cornerMap.get(token);
    const parts = token.split('/');
    const positionIndex = objIndex(parts[0], sourcePositions.length);
    const uvIndex = parts[1] ? objIndex(parts[1], sourceUvs.length) : -1;
    const normalIndex = parts[2] ? objIndex(parts[2], sourceNormals.length) : -1;
    const position = sourcePositions[positionIndex] || [0, 0, 0];
    const uv = sourceUvs[uvIndex] || [0, 0];
    const normal = sourceNormals[normalIndex] || [0, 0, 0];
    const index = positions.length / 3;
    positions.push(...position);
    uvs.push(...uv);
    normals.push(...normal);
    sourceIndices.push(Math.max(0, positionIndex));
    cornerMap.set(token, index);
    return index;
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('v ')) {
      const values = line.split(/\s+/);
      sourcePositions.push(values.slice(1, 4).map(Number));
    } else if (line.startsWith('vt ')) {
      const values = line.split(/\s+/);
      sourceUvs.push(values.slice(1, 3).map(Number));
    } else if (line.startsWith('vn ')) {
      const values = line.split(/\s+/);
      sourceNormals.push(values.slice(1, 4).map(Number));
    } else if (line.startsWith('usemtl ')) {
      closeGroup();
      currentMaterial = line.slice(7).trim();
    } else if (line.startsWith('f ')) {
      const face = line.slice(2).trim().split(/\s+/).map(corner);
      for (let index = 1; index + 1 < face.length; index += 1) {
        const sourceFaceIndex = sourceFaceIndexes.get(currentMaterial) || 0;
        sourceFaceIndexes.set(currentMaterial, sourceFaceIndex + 1);
        const triangle = [face[0], face[index], face[index + 1]];
        const excluded = excludedByMaterial.get(currentMaterial);
        if (!excluded?.has(sourceFaceIndex) && !hasCollapsedEdge(...triangle)) {
          indices.push(...triangle);
        }
      }
    }
  }
  closeGroup();

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);

  const materialNames = [];
  const materialIndexes = new Map();
  for (const group of groups) {
    if (!materialIndexes.has(group.name)) {
      materialIndexes.set(group.name, materialNames.length);
      materialNames.push(group.name);
    }
    geometry.addGroup(group.start, group.count, materialIndexes.get(group.name));
  }
  if (!groups.length) {
    materialNames.push('');
    geometry.addGroup(0, indices.length, 0);
  }
  if (!sourceNormals.length || normals.every((value) => value === 0)) {
    geometry.computeVertexNormals();
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const materials = materialNames.map((name) => materialFor(creator, name));
  const mesh = new THREE.Mesh(geometry, materials.length === 1 ? materials[0] : materials);
  const object = new THREE.Group();
  object.add(mesh);
  return {
    object,
    mesh,
    materialNames,
    sourceIndices: new Uint32Array(sourceIndices),
    sourcePositions: new Float32Array(sourcePositions.flat()),
    sourceNormals: new Float32Array(sourceNormals.flat()),
  };
}

async function loadIndexedObj(record) {
  const loader = new MTLLoader();
  const materialBase = folderOf(record.mtl);
  loader.setResourcePath(materialBase);
  const materialSource = typeof record.mtlText === 'string'
    ? Promise.resolve(loader.parse(record.mtlText, materialBase))
    : loader.loadAsync(record.mtl);
  const [creator, response] = await Promise.all([
    materialSource,
    fetch(record.obj, { cache: 'no-cache' }),
  ]);
  if (!response.ok) throw new Error(`OBJを読み込めません (${response.status})`);
  creator.preload();
  return parseObj(await response.text(), creator, record.excludedFaces);
}

function halfToFloat(value) {
  const sign = (value & 0x8000) ? -1 : 1;
  const exponent = (value >>> 10) & 0x1f;
  const fraction = value & 0x03ff;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
  if (exponent === 31) return fraction ? Number.NaN : sign * Number.POSITIVE_INFINITY;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

function readArray(buffer, payloadStart, descriptor) {
  const bytes = { f16: 2, f32: 4, u16: 2, u32: 4 }[descriptor.type];
  const start = payloadStart + descriptor.offset;
  const copy = buffer.slice(start, start + descriptor.count * bytes);
  if (descriptor.type === 'f32') return new Float32Array(copy);
  if (descriptor.type === 'u16') return new Uint16Array(copy);
  if (descriptor.type === 'u32') return new Uint32Array(copy);
  const source = new Uint16Array(copy);
  const result = new Float32Array(source.length);
  for (let index = 0; index < source.length; index += 1) {
    result[index] = halfToFloat(source[index]);
  }
  return result;
}

async function readMotion(url) {
  // The in-memory cache below already avoids duplicate downloads during a
  // session.  Revalidate the file on a new page load so a regenerated DPA at
  // the same stable URL cannot be paired with a newer OBJ from the manifest.
  const response = await fetch(url, { cache: /^data\/prepared\/[a-f0-9]+\.dpa$/.test(url) ? 'default' : 'no-cache' });
  if (!response.ok) throw new Error(`モーションを読み込めません (${response.status})`);
  const buffer = await response.arrayBuffer();
  const view = new DataView(buffer);
  const magic = new TextDecoder('ascii').decode(new Uint8Array(buffer, 0, 4));
  if (magic !== 'DPA1') throw new Error('モーション形式が正しくありません');
  const headerLength = view.getUint32(4, true);
  const headerText = new TextDecoder('utf-8', { fatal: true })
    .decode(new Uint8Array(buffer, 8, headerLength));
  const header = JSON.parse(headerText);
  const arrays = {};
  const payloadStart = 8 + headerLength;
  for (const [name, descriptor] of Object.entries(header.arrays || {})) {
    arrays[name] = readArray(buffer, payloadStart, descriptor);
  }
  return { ...header, arrays };
}

function loadMotion(url, cache = true) {
  // Battle owns the decoded motion; avoid retaining its large base64 URL as a second cache key.
  if (!cache) return readMotion(url);
  if (!motionCache.has(url)) motionCache.set(url, readMotion(url));
  return motionCache.get(url);
}

function scatter(asset, source, sourceNormals = null) {
  const attribute = asset.mesh.geometry.getAttribute('position');
  const target = attribute.array;
  for (let index = 0; index < asset.sourceIndices.length; index += 1) {
    const sourceOffset = asset.sourceIndices[index] * 3;
    const targetOffset = index * 3;
    target[targetOffset] = source[sourceOffset];
    target[targetOffset + 1] = source[sourceOffset + 1];
    target[targetOffset + 2] = source[sourceOffset + 2];
  }
  attribute.needsUpdate = true;
  if (sourceNormals && sourceNormals.length === asset.sourcePositions.length) {
    const normalAttribute = asset.mesh.geometry.getAttribute('normal');
    const normalTarget = normalAttribute.array;
    for (let index = 0; index < asset.sourceIndices.length; index += 1) {
      const sourceOffset = asset.sourceIndices[index] * 3;
      const targetOffset = index * 3;
      normalTarget[targetOffset] = sourceNormals[sourceOffset];
      normalTarget[targetOffset + 1] = sourceNormals[sourceOffset + 1];
      normalTarget[targetOffset + 2] = sourceNormals[sourceOffset + 2];
    }
    normalAttribute.needsUpdate = true;
  } else {
    asset.mesh.geometry.computeVertexNormals();
  }
  asset.mesh.geometry.computeBoundingBox();
  asset.mesh.geometry.computeBoundingSphere();
  refreshLayerBounds(asset);
}

/** Keep split material layers in sync with the shared animated position buffer. */
function refreshLayerBounds(asset) {
  const records = asset?.layerBounds || [];
  if (!records.length) return;
  const sourceGeometry = asset.mesh?.geometry;
  const position = sourceGeometry?.getAttribute('position');
  const index = sourceGeometry?.index;
  if (!position) return;
  const point = new THREE.Vector3();
  for (const record of records) {
    const box = record.geometry.boundingBox || new THREE.Box3();
    box.makeEmpty();
    const end = record.start + record.count;
    for (let offset = record.start; offset < end; offset += 1) {
      const vertex = index ? index.getX(offset) : offset;
      point.fromBufferAttribute(position, vertex);
      box.expandByPoint(point);
    }
    record.geometry.boundingBox = box;
    record.geometry.boundingSphere = box.getBoundingSphere(
      record.geometry.boundingSphere || new THREE.Sphere(),
    );
  }
}

function createDeformAnimator(asset, motion, appearance = null) {
  if (asset.sourcePositions.length / 3 !== motion.vertexCount) {
    throw new Error(`頂点数が一致しません (OBJ ${asset.sourcePositions.length / 3} / motion ${motion.vertexCount})`);
  }
  const frameCount = Math.max(1, Number(motion.frames) || 1);
  const fps = Math.max(1, Number(motion.fps) || 30);
  let previousFrame = -1;
  const output = new Float32Array(asset.sourcePositions.length);
  const bodyVertices = sourceVerticesForMaterials(
    asset, appearance?.bodyMaterials || [],
  );
  const headVertices = sourceVerticesForMaterials(
    asset, appearance?.headMaterials || [],
  );
  const defaultBodyScale = Number(
    appearance?.defaultBodyScale ?? motion.bodyScale,
  ) || 1;
  const defaultBodyWidthScale = Number(
    appearance?.defaultBodyWidthScale ?? defaultBodyScale,
  ) || defaultBodyScale;
  const defaultHeadScale = Number(appearance?.defaultHeadScale) || 1;
  let bodyScale = Number(appearance?.bodyScale) || defaultBodyScale;
  let bodyWidthScale = Number(appearance?.bodyWidthScale) || defaultBodyWidthScale;
  let headScale = Number(appearance?.headScale) || defaultHeadScale;

  function setBodyType(nextBodyScale, nextHeadScale, nextBodyWidthScale) {
    bodyScale = Number(nextBodyScale) || defaultBodyScale;
    bodyWidthScale = Number(nextBodyWidthScale) || defaultBodyWidthScale;
    headScale = Number(nextHeadScale) || defaultHeadScale;
    previousFrame = -1;
  }

  function transformVertex(values, vertex, matrix) {
    const offset = vertex * 3;
    const x = values[offset];
    const y = values[offset + 1];
    const z = values[offset + 2];
    const elements = matrix.elements;
    values[offset] = elements[0] * x + elements[4] * y + elements[8] * z + elements[12];
    values[offset + 1] = elements[1] * x + elements[5] * y + elements[9] * z + elements[13];
    values[offset + 2] = elements[2] * x + elements[6] * y + elements[10] * z + elements[14];
  }

  function applyBodyType(frame) {
    if (!appearance) return;
    const bodyHeightRatio = bodyScale / defaultBodyScale;
    const bodyWidthRatio = bodyWidthScale / defaultBodyWidthScale;
    if (Math.abs(bodyHeightRatio - 1) > 1e-6
        || Math.abs(bodyWidthRatio - 1) > 1e-6) {
      for (const vertex of bodyVertices) {
        const offset = vertex * 3;
        output[offset] *= bodyWidthRatio;
        output[offset + 1] *= bodyHeightRatio;
        output[offset + 2] *= bodyWidthRatio;
      }
    }
    const pose = motion.arrays.pose;
    const headBone = motion.bones?.head;
    if (!pose || headBone == null || !headVertices.length) return;
    if (Math.abs(bodyScale - defaultBodyScale) <= 1e-6
        && Math.abs(bodyWidthScale - defaultBodyWidthScale) <= 1e-6
        && Math.abs(headScale - defaultHeadScale) <= 1e-6) return;
    const poseOffset = (frame * Number(motion.poseJoints) + headBone) * 12;
    const oldPose = rigidPose(
      pose, poseOffset, defaultBodyScale, defaultBodyWidthScale,
    )
      .multiply(new THREE.Matrix4().makeScale(
        defaultHeadScale, defaultHeadScale, defaultHeadScale,
      ));
    const nextPose = rigidPose(pose, poseOffset, bodyScale, bodyWidthScale)
      .multiply(new THREE.Matrix4().makeScale(headScale, headScale, headScale));
    const adjustment = nextPose.multiply(oldPose.invert());
    for (const vertex of headVertices) transformVertex(output, vertex, adjustment);
  }

  if (motion.kind === 'frames') {
    return {
      name: motion.motion || 'wait',
      setBodyType,
      update(seconds) {
        const frame = Math.floor(seconds * fps) % frameCount;
        if (frame === previousFrame) return;
        previousFrame = frame;
        const offset = frame * motion.vertexCount * 3;
        output.set(motion.arrays.positions.subarray(offset, offset + output.length));
        applyBodyType(frame);
        scatter(asset, output);
      },
    };
  }

  const matrices = motion.arrays.matrices;
  const vertices = motion.arrays.vertices;
  const joints = motion.arrays.joints;
  const weights = motion.arrays.weights;
  const bound = motion.arrays.bound;
  const normalBound = motion.arrays.normalBound;
  const hasAuthoredNormals = Boolean(
    normalBound
    && normalBound.length === bound.length
    && asset.sourceNormals.length === asset.sourcePositions.length,
  );
  const normalMatrices = hasAuthoredNormals
    ? new Float32Array(motion.joints * 9) : null;
  const normalOutput = hasAuthoredNormals
    ? new Float32Array(asset.sourcePositions.length) : null;
  const weightSums = new Float32Array(motion.vertexCount);
  for (let index = 0; index < vertices.length; index += 1) {
    weightSums[vertices[index]] += weights[index];
  }

  function buildNormalMatrices(frameOffset) {
    for (let joint = 0; joint < motion.joints; joint += 1) {
      const offset = frameOffset + joint * 12;
      const target = joint * 9;
      const a = matrices[offset];
      const b = matrices[offset + 1];
      const c = matrices[offset + 2];
      const d = matrices[offset + 4];
      const e = matrices[offset + 5];
      const f = matrices[offset + 6];
      const g = matrices[offset + 8];
      const h = matrices[offset + 9];
      const i = matrices[offset + 10];
      const determinant = (
        a * (e * i - f * h)
        - b * (d * i - f * g)
        + c * (d * h - e * g)
      );
      if (Math.abs(determinant) < 1e-10) {
        normalMatrices[target] = 1;
        normalMatrices[target + 4] = 1;
        normalMatrices[target + 8] = 1;
        continue;
      }
      const inverse = 1 / determinant;
      // Inverse-transpose of the current joint's 3x3 linear transform.
      normalMatrices[target] = (e * i - f * h) * inverse;
      normalMatrices[target + 1] = (f * g - d * i) * inverse;
      normalMatrices[target + 2] = (d * h - e * g) * inverse;
      normalMatrices[target + 3] = (c * h - b * i) * inverse;
      normalMatrices[target + 4] = (a * i - c * g) * inverse;
      normalMatrices[target + 5] = (b * g - a * h) * inverse;
      normalMatrices[target + 6] = (b * f - c * e) * inverse;
      normalMatrices[target + 7] = (c * d - a * f) * inverse;
      normalMatrices[target + 8] = (a * e - b * d) * inverse;
    }
  }

  return {
    name: motion.motion || 'wait',
    setBodyType,
    update(seconds) {
      const frame = Math.floor(seconds * fps) % frameCount;
      if (frame === previousFrame) return;
      previousFrame = frame;
      output.fill(0);
      const frameOffset = frame * motion.joints * 12;
      if (hasAuthoredNormals) {
        normalOutput.fill(0);
        buildNormalMatrices(frameOffset);
      }
      for (let index = 0; index < vertices.length; index += 1) {
        const vertex = vertices[index];
        const matrixOffset = frameOffset + joints[index] * 12;
        const boundOffset = index * 3;
        const targetOffset = vertex * 3;
        const x = bound[boundOffset];
        const y = bound[boundOffset + 1];
        const z = bound[boundOffset + 2];
        const weight = weights[index];
        output[targetOffset] += (
          matrices[matrixOffset] * x + matrices[matrixOffset + 1] * y
          + matrices[matrixOffset + 2] * z + matrices[matrixOffset + 3]
        ) * weight;
        output[targetOffset + 1] += (
          matrices[matrixOffset + 4] * x + matrices[matrixOffset + 5] * y
          + matrices[matrixOffset + 6] * z + matrices[matrixOffset + 7]
        ) * weight;
        output[targetOffset + 2] += (
          matrices[matrixOffset + 8] * x + matrices[matrixOffset + 9] * y
          + matrices[matrixOffset + 10] * z + matrices[matrixOffset + 11]
        ) * weight;
        if (hasAuthoredNormals) {
          const normalMatrixOffset = joints[index] * 9;
          const normalX = normalBound[boundOffset];
          const normalY = normalBound[boundOffset + 1];
          const normalZ = normalBound[boundOffset + 2];
          normalOutput[targetOffset] += (
            normalMatrices[normalMatrixOffset] * normalX
            + normalMatrices[normalMatrixOffset + 1] * normalY
            + normalMatrices[normalMatrixOffset + 2] * normalZ
          ) * weight;
          normalOutput[targetOffset + 1] += (
            normalMatrices[normalMatrixOffset + 3] * normalX
            + normalMatrices[normalMatrixOffset + 4] * normalY
            + normalMatrices[normalMatrixOffset + 5] * normalZ
          ) * weight;
          normalOutput[targetOffset + 2] += (
            normalMatrices[normalMatrixOffset + 6] * normalX
            + normalMatrices[normalMatrixOffset + 7] * normalY
            + normalMatrices[normalMatrixOffset + 8] * normalZ
          ) * weight;
        }
      }
      for (let vertex = 0; vertex < motion.vertexCount; vertex += 1) {
        const remainder = Math.max(0, 1 - weightSums[vertex]);
        if (remainder <= 0.0001) continue;
        const offset = vertex * 3;
        output[offset] += asset.sourcePositions[offset] * remainder;
        output[offset + 1] += asset.sourcePositions[offset + 1] * remainder;
        output[offset + 2] += asset.sourcePositions[offset + 2] * remainder;
      }
      if (hasAuthoredNormals) {
        for (let vertex = 0; vertex < motion.vertexCount; vertex += 1) {
          const offset = vertex * 3;
          const length = Math.hypot(
            normalOutput[offset],
            normalOutput[offset + 1],
            normalOutput[offset + 2],
          );
          if (length > 1e-8) {
            normalOutput[offset] /= length;
            normalOutput[offset + 1] /= length;
            normalOutput[offset + 2] /= length;
          } else {
            normalOutput[offset] = asset.sourceNormals[offset];
            normalOutput[offset + 1] = asset.sourceNormals[offset + 1];
            normalOutput[offset + 2] = asset.sourceNormals[offset + 2];
          }
        }
      }
      applyBodyType(frame);
      scatter(asset, output, normalOutput);
    },
  };
}

/** Skin NDF equipment with the pose of whichever base motion is selected. */
function createMappedSkinAnimator(
  asset, binding, baseMotion, bodyScaleOverride = null, bodyWidthScaleOverride = null,
) {
  if (binding.kind !== 'mapped-skin') {
    throw new Error('装備スキン形式が正しくありません');
  }
  if (asset.sourcePositions.length / 3 !== binding.vertexCount) {
    throw new Error(`頂点数が一致しません (OBJ ${asset.sourcePositions.length / 3} / skin ${binding.vertexCount})`);
  }
  const pose = baseMotion.arrays.pose;
  if (!pose) throw new Error('ベースモーションに姿勢データがありません');
  const frameCount = Math.max(1, Number(baseMotion.frames) || 1);
  const fps = Math.max(1, Number(baseMotion.fps) || 30);
  const poseJoints = Number(baseMotion.poseJoints);
  const localJoints = Number(binding.joints);
  let bodyScale = Number(bodyScaleOverride ?? binding.bodyScale) || 1;
  let bodyWidthScale = Number(bodyWidthScaleOverride ?? bodyScale) || bodyScale;
  const binds = binding.arrays.binds;
  const boneMap = binding.arrays.boneMap;
  const vertices = binding.arrays.vertices;
  const joints = binding.arrays.joints;
  const weights = binding.arrays.weights;
  const bound = binding.arrays.bound;
  const palettes = new Float32Array(localJoints * 12);
  const output = new Float32Array(asset.sourcePositions.length);
  const weightSums = new Float32Array(binding.vertexCount);
  for (let index = 0; index < vertices.length; index += 1) {
    weightSums[vertices[index]] += weights[index];
  }
  let previousFrame = -1;

  function buildPalettes(frame) {
    for (let localJoint = 0; localJoint < localJoints; localJoint += 1) {
      const target = localJoint * 12;
      const bodyJoint = boneMap[localJoint];
      if (bodyJoint === 65535 || bodyJoint >= poseJoints) {
        palettes.fill(0, target, target + 12);
        palettes[target] = bodyWidthScale;
        palettes[target + 5] = bodyScale;
        palettes[target + 10] = bodyWidthScale;
        continue;
      }
      const poseOffset = (frame * poseJoints + bodyJoint) * 12;
      const bindOffset = localJoint * 16;
      for (let row = 0; row < 3; row += 1) {
        const poseRow = poseOffset + row * 4;
        const axisScale = row === 1 ? bodyScale : bodyWidthScale;
        for (let column = 0; column < 4; column += 1) {
          palettes[target + row * 4 + column] = axisScale * (
            pose[poseRow] * binds[bindOffset + column]
            + pose[poseRow + 1] * binds[bindOffset + 4 + column]
            + pose[poseRow + 2] * binds[bindOffset + 8 + column]
            + pose[poseRow + 3] * binds[bindOffset + 12 + column]
          );
        }
      }
    }
  }

  return {
    name: baseMotion.motion || 'wait',
    setBodyType(nextBodyScale, _nextHeadScale, nextBodyWidthScale) {
      bodyScale = Number(nextBodyScale) || Number(binding.bodyScale) || 1;
      bodyWidthScale = Number(nextBodyWidthScale) || bodyScale;
      previousFrame = -1;
    },
    update(seconds) {
      const frame = Math.floor(seconds * fps) % frameCount;
      if (frame === previousFrame) return;
      previousFrame = frame;
      buildPalettes(frame);
      output.fill(0);
      for (let index = 0; index < vertices.length; index += 1) {
        const vertex = vertices[index];
        const matrixOffset = joints[index] * 12;
        const boundOffset = index * 3;
        const targetOffset = vertex * 3;
        const x = bound[boundOffset];
        const y = bound[boundOffset + 1];
        const z = bound[boundOffset + 2];
        const weight = weights[index];
        output[targetOffset] += (
          palettes[matrixOffset] * x + palettes[matrixOffset + 1] * y
          + palettes[matrixOffset + 2] * z + palettes[matrixOffset + 3]
        ) * weight;
        output[targetOffset + 1] += (
          palettes[matrixOffset + 4] * x + palettes[matrixOffset + 5] * y
          + palettes[matrixOffset + 6] * z + palettes[matrixOffset + 7]
        ) * weight;
        output[targetOffset + 2] += (
          palettes[matrixOffset + 8] * x + palettes[matrixOffset + 9] * y
          + palettes[matrixOffset + 10] * z + palettes[matrixOffset + 11]
        ) * weight;
      }
      for (let vertex = 0; vertex < binding.vertexCount; vertex += 1) {
        const remainder = Math.max(0, 1 - weightSums[vertex]);
        if (remainder <= 0.0001) continue;
        const offset = vertex * 3;
        output[offset] += asset.sourcePositions[offset] * bodyWidthScale * remainder;
        output[offset + 1] += asset.sourcePositions[offset + 1] * bodyScale * remainder;
        output[offset + 2] += asset.sourcePositions[offset + 2] * bodyWidthScale * remainder;
      }
      scatter(asset, output);
    },
  };
}

function blinkClosed(seconds) {
  const time = Math.max(0, Number(seconds) || 0);
  let blinkAt = 1.0;
  let state = 0x6d2b79f5;
  const randomUint32 = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state;
  };
  while (blinkAt <= time) {
    if (time < blinkAt + 0.1) return true;
    const doubleBlink = randomUint32() % 10 === 0;
    let finished = blinkAt + 0.1;
    if (doubleBlink) {
      if (blinkAt + 0.2 <= time && time < blinkAt + 0.3) return true;
      finished = blinkAt + 0.3;
    }
    blinkAt = finished + 5.25 + randomUint32() / 4294967296;
  }
  return false;
}

function verticesForMaterial(asset, materialName) {
  const materialIndex = asset.materialNames.indexOf(materialName);
  if (materialIndex < 0) return new Uint32Array();
  const index = asset.mesh.geometry.index;
  const found = new Set();
  for (const group of asset.mesh.geometry.groups) {
    if (group.materialIndex !== materialIndex) continue;
    for (let offset = group.start; offset < group.start + group.count; offset += 1) {
      found.add(index ? index.getX(offset) : offset);
    }
  }
  return Uint32Array.from(found);
}

function sourceVerticesForMaterials(asset, materialNames) {
  const wanted = new Set(materialNames || []);
  if (!wanted.size) return new Uint32Array();
  const index = asset.mesh.geometry.index;
  const found = new Set();
  for (const group of asset.mesh.geometry.groups) {
    const name = asset.materialNames[group.materialIndex];
    if (!wanted.has(name)) continue;
    for (let offset = group.start; offset < group.start + group.count; offset += 1) {
      const expandedVertex = index ? index.getX(offset) : offset;
      found.add(asset.sourceIndices[expandedVertex]);
    }
  }
  return Uint32Array.from(found);
}

/** Reproduce NDF's dynamic eye/mouth atlas selection on the exported OBJ. */
function createFaceAnimator(asset, face, parts = null) {
  if (!face?.eye || !face?.mouth) return null;
  const attribute = asset.mesh.geometry.getAttribute('uv');
  const original = new Float32Array(attribute.array);
  const slotNames = ['skin', 'hair', 'mouth', 'eye', 'cheek', 'nose', 'brow'];
  const vertices = Object.fromEntries(slotNames.map((name) => [
    name, verticesForMaterial(asset, face[name]?.material),
  ]));
  const materials = Array.isArray(asset.mesh.material)
    ? asset.mesh.material : [asset.mesh.material];
  const materialForSlot = Object.fromEntries(slotNames.map((name) => {
    const index = asset.materialNames.indexOf(face[name]?.material);
    return [name, index >= 0 ? materials[index] : null];
  }));
  const defaults = parts?.defaults || {};
  const selected = {
    facetype: Number(defaults.facetype) || 0,
    eye: Number(defaults.eye) || 0,
    mouth: Number(defaults.mouth) || 0,
    nose: Number(defaults.nose) || 0,
    brow: Number(defaults.brow) || 0,
    cheek: Number(defaults.cheek) || 0,
    skin: String(defaults.skin ?? ''),
    hair: String(defaults.hair ?? ''),
  };
  let eyeEmotion = Number(face.eyeEmotionNormal) || 17;
  let mouthEmotion = Number(face.mouthEmotionNormal) || 10;
  let eyeBlink = true;
  let coloursDirty = true;
  const previousOffsets = Object.fromEntries(slotNames.map((name) => [name, '']));

  function apply(name, offset) {
    const normalOffset = face[name]?.normalOffset || [0, 0];
    const du = Number(offset[0]) - Number(normalOffset[0]);
    const dv = Number(offset[1]) - Number(normalOffset[1]);
    for (const vertex of vertices[name]) {
      attribute.array[vertex * 2] = original[vertex * 2] + du;
      attribute.array[vertex * 2 + 1] = original[vertex * 2 + 1] + dv;
    }
  }

  function atlasOffset(name, value) {
    const spec = face[name];
    const columns = Math.max(1, Number(spec?.columns) || (name === 'mouth' ? 16 : 32));
    const rows = Math.max(1, Number(spec?.rows) || 32);
    const index = Math.max(0, Number(value) || 0);
    return [
      Number(spec?.baseOffset?.[0] || 0) + (index % columns) / columns,
      Number(spec?.baseOffset?.[1] || 0) + Math.floor(index / columns) / rows,
    ];
  }

  function colourRecord(kind) {
    const rows = parts?.[`${kind}Colors`] || [];
    return rows.find((row) => String(row.uid) === selected[kind]) || rows[0];
  }

  function setMaterialColour(name, rgb) {
    const material = materialForSlot[name];
    if (!material?.color || !rgb) return;
    const values = rgb.map((value) => Number(value) / 255);
    if (material.userData?.ndfRawColour) {
      // NDF multiplies the stored 8-bit atlas and tint values directly.  The
      // simulator shader therefore keeps this colour in its original space.
      material.color.setRGB(...values);
    } else {
      material.color.setRGB(...values, THREE.SRGBColorSpace);
    }
    material.needsUpdate = true;
  }

  function updateColours() {
    const skin = colourRecord('skin')?.rgb || [255, 255, 255];
    const hair = colourRecord('hair')?.rgb || [255, 255, 255];
    const white = [255, 255, 255];
    setMaterialColour('skin', skin);
    setMaterialColour('hair', hair);
    setMaterialColour('nose', parts?.tints?.nose?.[selected.nose] ? skin : white);
    setMaterialColour('mouth', parts?.tints?.mouth?.[selected.mouth] ? hair : white);
    setMaterialColour('brow', parts?.tints?.brow?.[selected.brow] ? hair : white);
    coloursDirty = false;
  }

  function setSelected(name, value) {
    selected[name] = ['skin', 'hair'].includes(name) ? String(value) : Number(value);
    previousOffsets[name] = '';
    if (['skin', 'hair', 'mouth', 'nose', 'brow'].includes(name)) coloursDirty = true;
  }

  return {
    setPart(name, value) {
      if (name in selected) setSelected(name, value);
      if (name === 'facetype') {
        previousOffsets.skin = '';
        previousOffsets.hair = '';
      }
    },
    setEye(value) {
      eyeEmotion = Number(value);
      previousOffsets.eye = '';
    },
    setMouth(value) {
      mouthEmotion = Number(value);
      previousOffsets.mouth = '';
    },
    setBlink(value) {
      eyeBlink = Boolean(value);
      previousOffsets.eye = '';
    },
    update(seconds) {
      if (coloursDirty) updateColours();
      const faceType = parts?.faceTypes?.find(
        (entry) => Number(entry.index) === selected.facetype,
      ) || parts?.faceTypes?.[0];
      const offsets = {
        skin: atlasOffset('skin', faceType?.skinUv || 0),
        hair: atlasOffset('hair', faceType?.hairUv || 0),
        mouth: atlasOffset('mouth', selected.mouth),
        eye: atlasOffset('eye', selected.eye),
        cheek: atlasOffset('cheek', selected.cheek),
        nose: atlasOffset('nose', selected.nose),
        brow: atlasOffset('brow', selected.brow),
      };

      if (eyeEmotion >= 0 && eyeEmotion < Number(face.eyeEmotionCount)) {
        offsets.eye = [
          Number(face.eye.baseOffset[0]) + eyeEmotion / 32,
          Number(face.eye.baseOffset[1]) + Number(face.eyeEmotionRow),
        ];
      } else if (eyeBlink && blinkClosed(seconds)) {
        offsets.eye = [
          Number(face.eye.baseOffset[0]),
          Number(face.eye.baseOffset[1]) + Number(face.eyeEmotionRow),
        ];
      }

      const mouthCanEmote = parts?.mouthCanEmote?.[selected.mouth]
        ?? face.mouth.emotionEnabled !== false;
      if (mouthCanEmote
          && mouthEmotion >= 0 && mouthEmotion < Number(face.mouthEmotionCount)) {
        offsets.mouth = [
          Number(face.mouth.baseOffset[0]) + (mouthEmotion + 6) / 16,
          Number(face.mouth.baseOffset[1]) + Number(face.mouthEmotionRow),
        ];
      }

      let changed = false;
      for (const name of slotNames) {
        const key = offsets[name].join(',');
        if (key === previousOffsets[name]) continue;
        apply(name, offsets[name]);
        previousOffsets[name] = key;
        changed = true;
      }
      if (changed) {
        attribute.needsUpdate = true;
      }
    },
  };
}

function matrixFromRows(values, offset = 0) {
  const matrix = new THREE.Matrix4();
  matrix.set(
    values[offset], values[offset + 1], values[offset + 2], values[offset + 3],
    values[offset + 4], values[offset + 5], values[offset + 6], values[offset + 7],
    values[offset + 8], values[offset + 9], values[offset + 10], values[offset + 11],
    values[offset + 12] ?? 0, values[offset + 13] ?? 0,
    values[offset + 14] ?? 0, values[offset + 15] ?? 1,
  );
  return matrix;
}

function affineMatrixFromRows(values, offset = 0) {
  const matrix = new THREE.Matrix4();
  matrix.set(
    values[offset], values[offset + 1], values[offset + 2], values[offset + 3],
    values[offset + 4], values[offset + 5], values[offset + 6], values[offset + 7],
    values[offset + 8], values[offset + 9], values[offset + 10], values[offset + 11],
    0, 0, 0, 1,
  );
  return matrix;
}

function rigidPose(values, offset, translationScale, translationWidthScale = translationScale) {
  const rows = new Float32Array(16);
  rows.set(values.subarray(offset, offset + 12));
  rows[15] = 1;
  for (let axis = 0; axis < 3; axis += 1) {
    const length = Math.hypot(rows[axis], rows[4 + axis], rows[8 + axis]);
    if (length > 1e-8) {
      rows[axis] /= length;
      rows[4 + axis] /= length;
      rows[8 + axis] /= length;
    }
  }
  rows[3] *= translationWidthScale;
  rows[7] *= translationScale;
  rows[11] *= translationWidthScale;
  return matrixFromRows(rows);
}

function createRigidAnimator(object, animation, baseMotion) {
  const pose = baseMotion.arrays.pose;
  const rest = baseMotion.arrays.rest;
  const frameCount = Math.max(1, Number(baseMotion.frames) || 1);
  const fps = Math.max(1, Number(baseMotion.fps) || 30);
  const bone = baseMotion.bones?.[animation.bone || 'head'];
  if (bone == null) throw new Error(`骨が見つかりません: ${animation.bone || 'head'}`);
  const poseJoints = Number(baseMotion.poseJoints);
  const restMatrix = matrixFromRows(rest, bone * 16);
  const inverseRest = restMatrix.clone().invert();
  const attachment = animation.attachment
    ? matrixFromRows(new Float32Array(animation.attachment))
    : new THREE.Matrix4();
  let bodyScale = Number(animation.bodyScale) || 1;
  let bodyWidthScale = Number(animation.bodyWidthScale) || bodyScale;
  let headScale = Number(animation.headScale) || 1;
  let localPartScale = Number(animation.partScale) || 1;
  const scale = new THREE.Matrix4();
  const partScale = new THREE.Matrix4();
  const updateScales = () => {
    scale.makeScale(bodyWidthScale, bodyScale, bodyWidthScale);
    partScale.makeScale(localPartScale, localPartScale, localPartScale);
  };
  updateScales();
  object.matrixAutoUpdate = false;
  let previousFrame = -1;
  return {
    name: baseMotion.motion || 'wait',
    setBodyType(nextBodyScale, nextHeadScale, nextBodyWidthScale) {
      bodyScale = Number(nextBodyScale) || Number(animation.bodyScale) || 1;
      bodyWidthScale = Number(nextBodyWidthScale) || bodyScale;
      if (animation.type === 'head') {
        localPartScale = Number(nextHeadScale) || Number(animation.partScale) || 1;
      } else if (animation.type === 'antenna') {
        headScale = Number(nextHeadScale) || Number(animation.headScale) || 1;
      }
      updateScales();
      previousFrame = -1;
    },
    update(seconds) {
      const frame = Math.floor(seconds * fps) % frameCount;
      if (frame === previousFrame) return;
      previousFrame = frame;
      const offset = (frame * poseJoints + bone) * 12;
      if (animation.type === 'head') {
        object.matrix.copy(rigidPose(pose, offset, bodyScale, bodyWidthScale))
          .multiply(partScale);
      } else if (animation.type === 'antenna') {
        const antennaOffset = animation.offset || [0, 0, 0];
        const local = new THREE.Matrix4().makeTranslation(
          Number(antennaOffset[0] || 0) * headScale,
          Number(antennaOffset[1] || 0) * headScale,
          Number(antennaOffset[2] || 0) * headScale,
        );
        object.matrix.copy(rigidPose(pose, offset, bodyScale, bodyWidthScale))
          .multiply(local)
          .multiply(partScale);
      } else {
        object.matrix.copy(scale)
          .multiply(affineMatrixFromRows(pose, offset))
          .multiply(inverseRest)
          .multiply(attachment);
      }
      object.matrixWorldNeedsUpdate = true;
    },
  };
}
