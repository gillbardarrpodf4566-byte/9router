"use client";

import { useState } from "react";
import { Card, Button, Input, Modal } from "@/shared/components";

export default function CursorImportModal({ onClose }) {
  const [step, setStep] = useState(1); // 1: instructions, 2: loading, 3: success/failure
  const [error, setError] = useState("");
  const [tokenInfo, setTokenInfo] = useState(null);

  const handleDetectTokens = async () => {
    try {
      setStep(2);
      
      const res = await fetch("/api/cursor/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        throw new Error("检测失败");
      }

      const data = await res.json();
      setTokenInfo(data);
      setStep(3);
    } catch (e) {
      setError(e.message);
      setStep(3);
    }
  };

  const handleSubmitToDashboard = async () => {
    try {
      setStep(2);
      setError("");

      const res = await fetch(`/api/providers/cursor/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens: tokenInfo.tokens }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      window.location.reload();
    } catch (e) {
      setError(e.message);
      setStep(3);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">🔑 从 Cursor IDE 导入访问令牌</h3>
        <button onClick={onClose} className="text-text-muted hover:text-primary">✕</button>
      </div>

      {step === 1 && (
        <div className="space-y-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              💡 此脚本会自动读取你本地的 Cursor IDE 认证信息，并安全地导入到 9Router。
            </p>
          </div>

          <div className="space-y-4">
            <h4 className="font-medium">支持的操作系统：</h4>
            <ul className="list-disc list-inside text-sm space-y-1 text-text-muted">
              <li>Windows: `%APPDATA%\Cursor\User\globalStorage\state.vscstate`</li>
              <li>macOS: `~/Library/Application Support/Cursor/User/globalStorage/state.vscstate`</li>
              <li>Linux: `~/.config/Cursor/User/globalStorage/state.vscstate`</li>
            </ul>
          </div>

          <div className="border-t pt-4">
            <h4 className="font-medium mb-2">注意事项：</h4>
            <ul className="list-disc list-inside text-sm space-y-1 text-text-muted">
              <li>✅ Cursor IDE 必须已登录账号</li>
              <li>✅ Token 只在本地处理，不会上传到远程服务器</li>
              <li>⚠️ 建议执行后立即关闭此窗口</li>
            </ul>
          </div>

          <Button onClick={handleDetectTokens} className="w-full">
            🔍 开始检测 Token
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="text-center py-8">
          <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-sm text-text-muted">正在检测您的 Cursor IDE...</p>
        </div>
      )}

      {step === 3 && error && (
        <div className="text-center py-4">
          <p className="text-red-500 font-medium mb-2">❌ 检测到错误</p>
          <p className="text-sm text-text-muted mb-4">{error}</p>
          <Button onClick={() => setStep(1)} variant="secondary">
            返回重试
          </Button>
        </div>
      )}

      {step === 3 && tokenInfo && !error && (
        <div className="space-y-4">
          <p className="text-green-600 dark:text-green-400 font-medium">✅ 成功找到 Cursor 访问令牌！</p>

          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-text-muted">机器 ID:</span>
              <code className="text-xs bg-white dark:bg-gray-700 px-2 py-1 rounded">
                {tokenInfo.tokens[0]?.machineId || "未知"}
              </code>
            </div>
            {tokenInfo.tokens[0]?.email && (
              <div className="flex justify-between">
                <span className="text-sm text-text-muted">GitHub 用户:</span>
                <span className="text-sm">{tokenInfo.tokens[0].email}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 mt-4">
            <Button onClick={handleSubmitToDashboard} className="col-span-2">
              ✅ 确认导入到 Dashboard
            </Button>
            <Button onClick={() => setStep(1)} variant="secondary">
              返回重试
            </Button>
            <Button onClick={onClose} variant="secondary">
              取消
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
