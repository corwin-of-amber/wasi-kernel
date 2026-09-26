
/**
 * A tiny TAR analyzer that can be used to populate a `Directory`
 * directly as a backing store, without copying the files' payloads.
 */
class Tarball {
    blob: ArrayBuffer
    index: Map<string, {offset: number, size: number}>

    async fromBlob(blob: Blob) {
        this.blob = await blob.arrayBuffer();
        this.index = await buildTarIndex(this.blob);
        return this;
    }

    *entries() {
        let dirnames = new Set([...this.index.keys()]
            .map(s => s.replace(/\/?[^/]+$/, '')));
        for (let d of dirnames) if (d) yield [d] 
        for (let [fn, o] of this.index.entries()) {
            yield [fn, o.offset, o.size];
        }
    }
}


async function buildTarIndex(blob: ArrayBuffer) {
    const fileIndex = new Map();
    let offset = 0;
    const BLOCK_SIZE = 512;
    const decoder = new TextDecoder('utf-8');

    while (offset < blob.byteLength) {
        // 1. Read only the 512-byte header block
        const headerBuffer = blob.slice(offset, offset + BLOCK_SIZE);
        const view = new DataView(headerBuffer);

        // End of archive marker is a completely empty block
        if (view.getUint32(0) === 0 && view.getUint32(4) === 0) {
            break;
        }

        // 2. Parse filename (Null-terminated ASCII string, bytes 0-100)
        const nameBytes = new Uint8Array(headerBuffer, 0, 100);
        const nullIdx = nameBytes.indexOf(0);
        const filename = decoder.decode(nameBytes.subarray(0, nullIdx > -1 ? nullIdx : 100)).trim();

        if (!filename) break;

        // 3. Parse file size (Octal ASCII string, bytes 124-136)
        const sizeBytes = new Uint8Array(headerBuffer, 124, 12);
        const sizeStr = decoder.decode(sizeBytes).trim();
        const fileSize = parseInt(sizeStr, 8);

        // 4. Calculate exact position of file content
        const contentStartOffset = offset + BLOCK_SIZE;

        // Save metadata to our lookup index
        fileIndex.set(filename, {
            offset: contentStartOffset,
            size: fileSize
        });

        // 5. Calculate data block size padded to 512-byte boundaries
        const paddedSize = Math.ceil(fileSize / BLOCK_SIZE) * BLOCK_SIZE;

        // Jump directly to the next header block
        offset += BLOCK_SIZE + paddedSize;
    }

    return fileIndex;
}

/**
 * Extracts a specific file instantly using the pre-computed index.
 */
function extractFileFromIndex(blob, fileIndex, filename) {
    const meta = fileIndex.get(filename);
    if (!meta) {
        throw new Error(`File not found in archive: ${filename}`);
    }

    // Slice the file out of the large blob without loading it entirely into memory
    return blob.slice(meta.offset, meta.offset + meta.size);
}

// ============================================================================
// Example Usage:
// ============================================================================
async function handleTarFile(fileBlob) {
    // Build the lightweight index
    console.log("Indexing tarball...");
    const tarIndex = await buildTarIndex(fileBlob);
    console.log("Indexed files:", Array.from(tarIndex.keys()));

    // Instantly grab a specific file later
    try {
        const targetFile = "images/logo.png";
        const fileSlice = extractFileFromIndex(fileBlob, tarIndex, targetFile);

        // Convert to a local URL for an <img> src, or download it
        const fileUrl = URL.createObjectURL(fileSlice);
        console.log(`File extracted! Object URL: ${fileUrl}`);
    } catch (err) {
        console.error(err.message);
    }
}


export { Tarball }