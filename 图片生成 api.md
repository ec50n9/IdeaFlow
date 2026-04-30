## GPT-Image-2

### 文生图

```bash
curl -X POST "https://api.apiyi.com/v1/images/generations" \
  -H "Authorization: Bearer sk-your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2",
    "prompt": "一只戴墨镜的橘猫坐在海边吧台，电影画幅",
    "size": "2048x1152",
    "quality": "high",
    "output_format": "jpeg",
    "output_compression": 85
  }'
```

```json
{
  "created": 1776832476,
  "data": [
    {
      "b64_json": "iVBORw0KGgoAAAANSUhEUgAA..."
    }
  ],
  "usage": {
    "input_tokens": 42,
    "output_tokens": 6240,
    "total_tokens": 6282
  }
}
```

### 图生图

```bash
curl --request POST \
  --url https://api.apiyi.com/v1/images/edits \
  --header 'Authorization: Bearer <token>' \
  --header 'Content-Type: multipart/form-data' \
  --form model=gpt-image-2 \
  --form 'prompt=把图1的人物放进图2的场景，沿用图3的色彩风格' \
  --form 'image[]=<string>' \
  --form image[].items='@example-file' \
  --form mask='@example-file'

```

```json
{
  "created": 1776832476,
  "data": [
    {
      "b64_json": "iVBORw0KGgoAAAANSUhEUgAA..."
    }
  ],
  "usage": {
    "input_tokens": 1280,
    "output_tokens": 6240,
    "total_tokens": 7520
  }
}
```

## Nano Banana 2

### 文生图

```bash
curl --request POST \
  --url https://api.apiyi.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent \
  --header 'Authorization: Bearer <token>' \
  --header 'Content-Type: application/json' \
  --data '
{
  "contents": [
    {
      "parts": [
        {
          "text": "一只可爱的柴犬坐在樱花树下，水彩画风格，高清细节"
        }
      ]
    }
  ],
  "generationConfig": {
    "responseModalities": [
      "IMAGE"
    ],
    "imageConfig": {
      "aspectRatio": "16:9",
      "imageSize": "2K"
    }
  }
}
'
```

```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "inlineData": {
              "mimeType": "image/png",
              "data": "<string>"
            }
          }
        ]
      },
      "finishReason": "STOP"
    }
  ],
  "usageMetadata": {
    "promptTokenCount": 10,
    "candidatesTokenCount": 258
  }
}
```

### 图生图

```bash
curl --request POST \
  --url https://api.apiyi.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent \
  --header 'Authorization: Bearer <token>' \
  --header 'Content-Type: application/json' \
  --data '
{
  "contents": [
    {
      "parts": [
        {
          "text": "请把背景模糊化，突出前景的人物"
        },
        {
          "inlineData": {
            "mimeType": "image/jpeg",
            "data": "BASE64_ENCODED_IMAGE_DATA"
          }
        }
      ]
    }
  ],
  "generationConfig": {
    "responseModalities": [
      "IMAGE"
    ],
    "imageConfig": {
      "aspectRatio": "16:9",
      "imageSize": "2K"
    }
  }
}
'
```

```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "inlineData": {
              "mimeType": "image/png",
              "data": "<string>"
            }
          }
        ]
      },
      "finishReason": "STOP"
    }
  ],
  "usageMetadata": {
    "promptTokenCount": 10,
    "candidatesTokenCount": 258
  }
}
```

## Nano Banana Pro

### 文生图

```bash
curl --request POST \
  --url https://api.apiyi.com/v1beta/models/gemini-3-pro-image-preview:generateContent \
  --header 'Authorization: Bearer <token>' \
  --header 'Content-Type: application/json' \
  --data '
{
  "contents": [
    {
      "parts": [
        {
          "text": "一只可爱的小猫坐在花园里，油画风格，高清，细节丰富"
        }
      ]
    }
  ],
  "generationConfig": {
    "responseModalities": [
      "IMAGE"
    ],
    "imageConfig": {
      "aspectRatio": "16:9",
      "imageSize": "2K"
    }
  }
}
'
```

```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "inlineData": {
              "mimeType": "image/png",
              "data": "<string>"
            }
          }
        ]
      },
      "finishReason": "STOP"
    }
  ],
  "usageMetadata": {
    "promptTokenCount": 10,
    "candidatesTokenCount": 258
  }
}
```

### 图生图

```bash
curl --request POST \
  --url https://api.apiyi.com/v1beta/models/gemini-3-pro-image-preview:generateContent \
  --header 'Authorization: Bearer <token>' \
  --header 'Content-Type: application/json' \
  --data '
{
  "contents": [
    {
      "parts": [
        {
          "text": "请把背景模糊化，突出前景的人物"
        },
        {
          "inlineData": {
            "mimeType": "image/jpeg",
            "data": "BASE64_ENCODED_IMAGE_DATA"
          }
        }
      ]
    }
  ],
  "generationConfig": {
    "responseModalities": [
      "IMAGE"
    ],
    "imageConfig": {
      "aspectRatio": "16:9",
      "imageSize": "2K"
    }
  }
}
'
```

```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "inlineData": {
              "mimeType": "image/png",
              "data": "<string>"
            }
          }
        ]
      },
      "finishReason": "STOP"
    }
  ],
  "usageMetadata": {
    "promptTokenCount": 10,
    "candidatesTokenCount": 258
  }
}
```

## FLUX

```bash
curl --request POST \
  --url https://api.apiyi.com/v1/images/generations \
  --header 'Authorization: Bearer <token>' \
  --header 'Content-Type: application/json' \
  --data '
{
  "model": "flux-2-pro",
  "prompt": "A cinematic shot of a futuristic city at sunset, 85mm lens"
}
'
```

```json
{
  "created": 1776832476,
  "data": [
    {
      "url": "https://delivery-eu.bfl.ai/results/xxx/sample.jpeg?signature=..."
    }
  ]
}
```

## Seedream

```bash
curl --request POST \
  --url https://api.apiyi.com/v1/images/generations \
  --header 'Authorization: Bearer <token>' \
  --header 'Content-Type: application/json' \
  --data @- <<EOF
{
  "model": "seedream-5-0-260128",
  "prompt": "A modern tech product launch poster, sleek smartphone on gradient background, text: 'Innovation 2026', ultra detailed, professional"
}
EOF
```

```json
{
  "model": "seedream-5-0-260128",
  "created": 1768518000,
  "data": [
    {
      "url": "https://ark-content-generation-v2-ap-southeast-1.tos-ap-southeast-1.bytepluses.com/seedream-5-0/.../image.png",
      "b64_json": "<string>",
      "size": "2048x2048"
    }
  ],
  "usage": {
    "generated_images": 1,
    "output_tokens": 6240,
    "total_tokens": 6240
  }
}
```
