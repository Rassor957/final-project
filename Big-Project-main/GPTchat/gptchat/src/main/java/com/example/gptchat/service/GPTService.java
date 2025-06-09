package com.example.gptchat.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class GPTService {

    @Value("${openai.api.key}")
    private String openaiApiKey;

    private final WebClient webClient = WebClient.builder()
            .baseUrl("https://api.openai.com/v1/chat/completions")
            .build();

    // 多輪對話記憶儲存區
    private final Map<String, List<Message>> conversationHistories = new ConcurrentHashMap<>();

    public String askGPT(String sessionId, String question) {
        List<Message> messages = conversationHistories.computeIfAbsent(sessionId, k -> new ArrayList<>());
        messages.add(new Message("user", question));

        var requestBody = new ChatRequest("gpt-4o", messages);

        ChatResponse response = webClient.post()
                .header("Authorization", "Bearer " + openaiApiKey)
                .header("Content-Type", "application/json")
                .bodyValue(requestBody)
                .retrieve()
                .bodyToMono(ChatResponse.class)
                .block();

        if (response != null && !response.choices.isEmpty()) {
            String reply = response.choices.get(0).message.content.trim();
            messages.add(new Message("assistant", reply));
            return reply;
        }

        return "GPT 無法回答您的問題";
    }

    public static class ChatRequest {
        public String model;
        public List<Message> messages;

        public ChatRequest(String model, List<Message> messages) {
            this.model = model;
            this.messages = messages;
        }
    }

    public static class Message {
        public String role;
        public String content;

        public Message(String role, String content) {
            this.role = role;
            this.content = content;
        }
    }

    public static class ChatResponse {
        public List<Choice> choices;

        public static class Choice {
            public Message message;
        }
    }
}
