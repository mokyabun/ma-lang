import { Buffer } from 'node:buffer'

const RPACK_MAP_BASE64 =
    'xA0eC70rP1X8RW71ZlNPGuC7MJSGumu/QVBvm+/etxBhFyDfMomonW2ryZAADF2v0sFW5RZkkYJldJfKI9ZS0f+0oOgvilg4WmAZlknb18g7PkNLpWNHqmopkvQVz2I0eNMdPOIFjipXDhvNTC3yQCwleUgPsnq1p2w35px7VH7+h9yaAuQzouuxLgPdmaaw59WIGIN89r7hXJ/DIUYfCE7QdhJf7v2PROqjXosoCTWeacwKx4UHrUrzd+ln1NqEgJO2TXP6JyZ/BMb78XI5UcI2qWis+O3FucvOdaQ9gdlCcByVEbzYjJj5WaET9xR9s+xxwOON8AGuWzEGJCI6uCz3hIvJZfu2n66zAy0BaXQf5KPs7lw0IZNKD2riYgKeIpz9PPxxx8atWWcFcG2KRBL6JIZfr9F6R87+UGPdUQZvGOBSqAmdVnNMuFNsw6AOGc8+DX4HMmhG6kj5mS6rpEkgXlU1OAy807FYFnkoChrh8s3EOduiumBydn2V73/IwN43lL+1FIGSJUWs5/Vmpys2WsET40s66I2DG3wnsJpC64eq3FSOeCbSVynUt/gvj4l18EF3wh7/2BUR5QSXF/Mx0JsA18q0Tyo72bJr2l2hPzBhvZE9Tubfvk2CjB0jEJhk9IUze5BDu6mI8dalHPbMbrlbC5bt1enFywimgEA='

const rpackMap = Buffer.from(RPACK_MAP_BASE64, 'base64')
const encodeMap = rpackMap.subarray(0, 256)
const decodeMap = rpackMap.subarray(256, 512)

export function encodeRPack(input: Uint8Array): Uint8Array {
    return transformRPack(input, encodeMap)
}

export function decodeRPack(input: Uint8Array): Uint8Array {
    return transformRPack(input, decodeMap)
}

function transformRPack(input: Uint8Array, map: Uint8Array): Uint8Array {
    const output = new Uint8Array(input.length)
    for (let index = 0; index < input.length; index += 1) {
        output[index] = map[input[index] || 0] || 0
    }
    return output
}
