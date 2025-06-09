package com.example.gptchat.controller;

import com.example.gptchat.service.GPTService;
import org.springframework.web.bind.annotation.*;

@CrossOrigin
@RestController
@RequestMapping("/GPT")
public class ChatController {

    private final GPTService gptService;

    public ChatController(GPTService gptService) {
        this.gptService = gptService;
    }

    @PostMapping("/P1")
    public String askGPT(@RequestBody QuestionRequest request) {
        return gptService.askGPT(request.getSessionId(), request.getQuestion());
    }

    // 新增：處理 GET 請求，回傳提示訊息
    @GetMapping("/P1")
    public String handleGet() {
        return "GET 方法不支援，請用 POST 送出問題";
    }

    public static class QuestionRequest {
        private String question;
        private String sessionId;

        public String getQuestion() {
            return question;
        }

        public void setQuestion(String question) {
            this.question = question;
        }

        public String getSessionId() {
            return sessionId;
        }

        public void setSessionId(String sessionId) {
            this.sessionId = sessionId;
        }
    }
}
