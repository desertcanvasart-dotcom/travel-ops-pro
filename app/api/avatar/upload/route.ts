import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUserId } from '@/lib/auth/current-org'
import { safeExtension, safeKeySegment } from '@/lib/storage-key'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    // WHOSE avatar this is comes from the SESSION, never from the request.
    //
    // It used to be `formData.get('userId')`. This route runs on the
    // service-role client and finishes by writing
    // `user_profiles.avatar_url` WHERE id = that value, so any signed-in
    // account could hand over somebody else's id and replace their avatar with
    // an image of its choosing — a stranger's face on a colleague's profile,
    // and nothing in the request that looked wrong. It is also, deliberately,
    // one of the self-service routes the middleware leaves ungated, which is
    // correct only for a route that acts on the caller.
    //
    // lib/auth/current-org.ts exists for exactly this: "a logged-in user could
    // otherwise pass someone else's id and act on their data (IDOR)".
    //
    // app/settings/page.tsx no longer sends a userId field, and one arriving
    // from anywhere else is ignored rather than trusted.
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Not signed in' },
        { status: 401 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
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

    // Generate unique filename. Both halves are sanitised even though userId is
    // now a session-derived uuid and the extension cannot contain a `..` — the
    // guarantee should hold at the point the key is built, not depend on
    // remembering where each value came from.
    const fileExt = safeExtension(file.name, 'png')
    const fileName = `${safeKeySegment(userId)}-${Date.now()}.${fileExt}`
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