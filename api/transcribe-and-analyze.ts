import type { VercelRequest, VercelResponse } from '@vercel/node';
import sdk from 'microsoft-cognitiveservices-speech-sdk';

// 環境変数からAPIキーとエンドポイントを取得
const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION;
const AZURE_SPEECH_ENDPOINT = process.env.AZURE_SPEECH_ENDPOINT;

if (!AZURE_SPEECH_KEY || !AZURE_SPEECH_REGION || !AZURE_SPEECH_ENDPOINT) {
  throw new Error('Azure Speech APIの環境変数が設定されていません。');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // 音声ファイル（バイナリ）を受け取る
  const audioBuffer = req.body;
  if (!audioBuffer || !(audioBuffer instanceof Buffer)) {
    res.status(400).json({ error: '音声ファイル（バイナリデータ）が正しく送信されていません' });
    return;
  }

  // Azure Speech SDKの設定
  const speechConfig = sdk.SpeechConfig.fromSubscription(
    AZURE_SPEECH_KEY!,
    AZURE_SPEECH_REGION!
  );
  speechConfig.endpointId = AZURE_SPEECH_ENDPOINT!;
  speechConfig.speechRecognitionLanguage = 'ja-JP';

  // 話者分離オプションを有効化
  speechConfig.setProperty(
    sdk.PropertyId.SpeechServiceConnection_SpeakerIdMode,
    'Conversation'
  );

  // PushStreamにバイナリデータを流し込む
  const pushStream = sdk.AudioInputStream.createPushStream();
  pushStream.write(audioBuffer);
  pushStream.close();

  const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
  const recognizer = new sdk.ConversationTranscriber(speechConfig, audioConfig);

  let resultText = '';
  let speakerLabels: string[] = [];

  recognizer.transcribed = (s, e) => {
    if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
      resultText += e.result.text + '\n';
      if (e.result.speakerId && !speakerLabels.includes(e.result.speakerId)) {
        speakerLabels.push(e.result.speakerId);
      }
    }
  };

  recognizer.canceled = (s, e) => {
    res.status(500).json({ error: 'Azure Speech API canceled', details: e });
  };

  recognizer.sessionStopped = (s, e) => {
    // 認識終了時に結果を返す
    res.status(200).json({
      text: resultText,
      speakers: speakerLabels,
    });
  };

  // 開始
  recognizer.startTranscribingAsync();
}
