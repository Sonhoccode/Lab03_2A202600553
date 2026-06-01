# Luong Hoat Dong Chi Tiet

Tai lieu nay mo ta chi tiet luong chay cua project `Chatbot vs ReAct Agent`, bao gom:
- baseline chatbot
- ReAct agent
- tool bay gia lap
- telemetry va xu ly loi

Muc tieu la giup doc gia hieu ro tung buoc du lieu di qua code, va hieu vi sao agent cho ket qua dung hon chatbot trong cac bai toan nhieu buoc.

## 1. Tong Quan He Thong

Project co 3 lop chinh:

1. `chatbot.py` va `src/chatbot.py`
   - Chay baseline chatbot.
   - Moi cau hoi chi goi LLM 1 lan.
   - Khong dung tool.

2. `src/agent_runner.py`
   - Chay ReAct agent.
   - Goi LLM nhieu lan theo vong `Thought -> Action -> Observation`.
   - Co the goi tool de tra cuu thong tin ve may bay.

3. `src/tools/flight_tools.py`
   - Chua cac ham mo phong du lieu bay.
   - Day la "source of truth" cho cac thao tac nhu tim chuyen bay, tinh gia, kiem tra hanh ly, ghe trong, va dat cho.

Ngoai ra con co:
- `src/core/openai_provider.py`
- `src/core/gemini_provider.py`
- `src/telemetry/logger.py`
- `src/telemetry/metrics.py`

## 2. Luong Chay Cua Baseline Chatbot

### 2.1 Diem vao

Khi chay:
```bash
python chatbot.py
```
hoac
```bash
python src/chatbot.py
```

chuong trinh se:
1. Nap bien moi truong tu `.env`
2. Tao provider trong ham `_build_provider()`
3. Chon OpenAI, Gemini, hoac local neu con ho tro
4. Chay danh sach case san co, hoac vao che do interactive

### 2.2 Chon provider

Ham `_build_provider()` trong `chatbot.py`:
- doc `DEFAULT_PROVIDER`
- neu la `gemini` hoac `google` thi tao `GeminiProvider`
- neu la `openai` thi tao `OpenAIProvider`

### 2.3 Goi LLM

Trong `_run_cases()` hoac `_interactive_loop()`:
1. User nhap cau hoi.
2. Ham `_baseline_prompt()` them role prompt co dinh.
3. `provider.generate(...)` duoc goi mot lan.
4. Tra ve chuoi tra loi truc tiep.

### 2.4 Dac diem cua chatbot

Chatbot baseline khong co:
- tool search chuyen bay
- tool tinh gia
- tool kiem tra hanh ly
- memory dai han

Vi the:
- neu cau hoi don gian thi tra loi nhanh
- neu cau hoi can du lieu that thi model thuong tu doan hoac tra loi chung chung

## 3. Luong Chay Cua ReAct Agent

### 3.1 Diem vao

Khi chay:
```bash
python src/agent_runner.py
```

chuong trinh se:
1. Nap `.env`
2. Chon provider
3. Tao `ReActAgent(llm=provider, tools=tool_specs, max_steps=5)`
4. Chay danh sach case hoac interactive mode

### 3.2 Cau truc vong ReAct

`ReActAgent.run()` chay theo vong:
1. Gui prompt hien tai sang LLM
2. LLM tra ve output co dang:
   - `Thought: ...`
   - `Action: {"tool": "...", "args": {...}}`
3. Agent parse JSON trong `Action`
4. Goi tool tuong ung
5. Lay `Observation`
6. Dua `Observation` tro lai prompt
7. Lap lai den khi co `Final Answer`

### 3.3 Prompt he thong

Ham `get_system_prompt()` tao mot prompt co:
- danh sach tool
- mo ta tung tool
- dinh dang output bat buoc

Muc tieu la ep model:
- phai suy luan theo tung buoc
- phai tra ve `Action` hop le
- khong duoc tra loi lanh canh khi chua co du lieu

### 3.4 Vong xu ly trong `run()`

Trong moi step:
1. `self.llm.generate(current_prompt, system_prompt=...)`
2. Neu LLM tra loi loi -> dung ngay va log `AGENT_LLM_ERROR`
3. Neu co `Final Answer:` -> ket thuc
4. Neu co `Action:` -> parse JSON
5. Goi `_execute_tool(tool_name, args)`
6. Log `AGENT_OBSERVATION`
7. Noi `Observation` vao `current_prompt`

### 3.5 Bo nho hoi thoai

Agent co rolling memory:
- luu cac luot user/assistant truoc do trong `self.history`
- so luot giu lai dieu khien boi `AGENT_MEMORY_TURNS`
- khi qua gioi han, luot cu bi cat bot

Lua chon nay giup:
- giu duoc nguyen mach hoi thoai
- khong lam prompt tang vo han
- giam nguy co het context window

## 4. Luong Tool Bay Gia Lap

File `src/tools/flight_tools.py` chua du lieu va ham xu ly.

### 4.1 `search_flights`

Ham nay loc du lieu theo:
- `origin`
- `destination`
- `date`
- `cabin`
- `budget`
- `carrier`

Ket qua tra ve:
- so luong chuyen phu hop
- danh sach flights
- bo loc da ap dung

### 4.2 `get_fare_rules`

Tra ve:
- quy dinh hoan/doi
- hanh ly
- dieu kien gia ve

### 4.3 `check_seat_availability`

Kiem tra:
- so ghe con
- so hanh khach can
- co du ghe hay khong

### 4.4 `calculate_total_price`

Tinh:
- gia goc
- tong add-on
- thue
- tong thanh toan

Day la tool quan trong nhat trong case tinh tong chi phi.

### 4.5 `create_booking`

Mo phong buoc dat ve:
- tao `booking_id`
- tra ve trang thai `confirmed`

## 5. Luong Telemetry

Project co 2 lop ghi log:

### 5.1 Logger

`src/telemetry/logger.py` ghi log theo JSON structure, thuong co cac event:
- `CHATBOT_CASE_START`
- `CHATBOT_CASE_END`
- `AGENT_START`
- `AGENT_LLM_RESPONSE`
- `AGENT_OBSERVATION`
- `AGENT_FINAL`
- `AGENT_END`
- `AGENT_LLM_ERROR`

### 5.2 Metrics

`src/telemetry/metrics.py` ghi:
- provider
- model
- prompt tokens
- completion tokens
- total tokens
- latency ms
- cost estimate

Muc dich:
- do hieu nang
- so sanh chatbot va agent
- phat hien loi quota, latency, hay parse error

## 6. Xu Ly Loi

### 6.1 Loi tu model

Co 3 nhom loi hay gap:
- `503 UNAVAILABLE`: model dang qua tai
- `429 RESOURCE_EXHAUSTED`: vuot quota / rate limit
- loi ket noi hoac API khac

### 6.2 Cach xu ly trong code

Trong `GeminiProvider`:
- retry voi backoff
- doc `retry in Xs` tu message loi neu co
- fallback sang model khac neu model chinh qua tai

Trong `ReActAgent`:
- neu LLM request fail thi log loi va tra ve thong bao loi
- neu khong parse duoc `Action` thi dung som
- neu tool fail thi tra ve error object thay vi crash

### 6.3 Y nghia thuc te

Dieu nay giup he thong:
- khong die hoan toan khi model nghen
- de debug hon qua log
- de thay duoc loi o model, o tool, hay o prompt

## 7. So Sanh Luong Chatbot Va Agent

### 7.1 Chatbot

Luong:
1. User nhap cau hoi
2. Prompt duoc dong goi
3. Goi LLM 1 lan
4. Tra loi truc tiep

Uu diem:
- don gian
- nhanh
- it token hon

Nhuoc diem:
- khong co tool
- khong xac minh du lieu
- de tu suy dien sai

### 7.2 Agent

Luong:
1. User nhap cau hoi
2. LLM suy luan
3. Tao `Action`
4. Goi tool
5. Lay `Observation`
6. Lap lai
7. Tra `Final Answer`

Uu diem:
- co du lieu that
- xu ly cau hoi nhieu buoc tot hon
- tinh toan va kiem tra ro rang

Nhuoc diem:
- cham hon
- ton token hon
- phu thuoc quota va do on dinh cua model

## 8. Ket Luat

Neu muc tieu la:
- hoi dap chung chung -> chatbot duoc
- tim ve, tinh gia, kiem tra dieu kien -> agent phu hop hon

Trong project nay, agent manh hon vi no:
- biet goi tool
- co memory
- co telemetry
- co vong lap suy luan

Nhung neu muon chay on dinh, can them:
- retry hop ly
- fallback model
- gioi han memory
- tool data tin cay hon

