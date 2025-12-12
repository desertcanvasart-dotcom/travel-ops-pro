import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const userId = formData.get('userId') as string

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      )
    }

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      )
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid file type. Only JPG, PNG, GIF, WEBP allowed.' },
        { status: 400 }
      )
    }

    // Validate file size (max 2MB)
    const maxSize = 2 * 1024 * 1024 // 2MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: 'File too large. Maximum size is 2MB.' },
        { status: 400 }
      )
    }

    // Generate unique filename
    const fileExt = file.name.split('.').pop()
    const fileName = `${userId}-${Date.now()}.${fileExt}`
    const filePath = `avatars/${fileName}`

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      
      // If bucket doesn't exist, create it
      if (uploadError.message?.includes('Bucket not found')) {
        // Try to create the bucket
        const { error: bucketError } = await supabase.storage.createBucket('avatars', {
          public: true,
          fileSizeLimit: 2 * 1024 * 1024 // 2MB
        })

        if (bucketError && !bucketError.message?.includes('already exists')) {
          throw bucketError
        }

        // Retry upload
        const { data: retryData, error: retryError } = await supabase.storage
          .from('avatars')
          .upload(filePath, buffer, {
            contentType: file.type,
            upsert: true
          })

        if (retryError) throw retryError
      } else {
        throw uploadError
      }
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath)

    const avatarUrl = urlData.publicUrl

    // Update user profile with new avatar URL
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', userId)

    if (updateError) {
      console.error('Profile update error:', updateError)
      // Don't fail - avatar is uploaded, just profile update failed
    }

    return NextResponse.json({
      success: true,
      url: avatarUrl
    })
  } catch (error) {
    console.error('Avatar upload error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to upload avatar' },
      { status: 500 }
    )
  }
}