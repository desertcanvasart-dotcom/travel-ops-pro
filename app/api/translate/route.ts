// app/api/translate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    // Check API key first
    if (!process.env.OPENAI_API_KEY) {
      console.error('Missing OPENAI_API_KEY')
      return NextResponse.json(
        { success: false, error: 'Translation service not configured' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const { text, targetLanguage, action } = body

    if (!text) {
      return NextResponse.json(
        { success: false, error: 'Text is required' },
        { status: 400 }
      )
    }

    if (!targetLanguage && action === 'fromEnglish') {
      return NextResponse.json(
        { success: false, error: 'Target language is required' },
        { status: 400 }
      )
    }

    // Build the prompt
    const targetLang = targetLanguage || 'Spanish'
    const prompt = `Translate the following English text to ${targetLang}. 
Only respond with the translation, nothing else. No quotes, no explanations.
Keep the tone friendly and professional, suitable for travel customer service.

Text: ${text}`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a professional translator. Respond only with the translation.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 1000
    })

    const translatedText = response.choices[0]?.message?.content?.trim()

    if (!translatedText) {
      return NextResponse.json(
        { success: false, error: 'Translation returned empty' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        translatedText,
        originalText: text,
        targetLanguage: targetLang
      }
    })

  } catch (error: any) {
    console.error('Translation API error:', error)
    
    // Check for specific OpenAI errors
    if (error?.status === 401 || error?.code === 'invalid_api_key') {
      return NextResponse.json(
        { success: false, error: 'Invalid API key' },
        { status: 401 }
      )
    }

    if (error?.status === 429) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429 }
      )
    }

    return NextResponse.json(
      { success: false, error: 'Translation failed' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Translation API is running',
    configured: !!process.env.OPENAI_API_KEY
  })
}