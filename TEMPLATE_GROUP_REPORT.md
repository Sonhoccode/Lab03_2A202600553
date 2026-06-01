# Báo Cáo Nhóm: Lab 3 - Hệ Thống Agentic Cấp Độ Production

- **Tên nhóm**: NoName

- **Thành viên nhóm**:  
  2A202600553 - Hoàng Ích Cao Sơn  
  2A202600746 - Hoàng Long Vũ  
  2A202600645 - Nguyễn Thị Yến  
  2A202600551 - Nguyễn Quốc Tiến

- **Ngày triển khai**: 2026-06-01

---

## 1. Tóm Tắt Điều Hành

Lab này so sánh chatbot LLM baseline trả lời trực tiếp với thiết kế travel agent theo kiểu ReAct cho các tác vụ tìm chuyến bay nội địa, kiểm tra điều kiện vé, kiểm tra số ghế, tính giá và tạo đặt chỗ. Chatbot baseline có thể tạo câu trả lời trôi chảy, nhưng không thể kiểm tra cơ sở dữ liệu chuyến bay được cung cấp hoặc tính tổng tiền dựa trên kết quả tool một cách đáng tin cậy. Kiến trúc ReAct agent giải quyết vấn đề này bằng cách ép các bước cần dữ liệu thực tế phải đi qua tool call có kiểm soát, sau đó đưa kết quả về lại cho LLM dưới dạng `Observation`.

- **Tình trạng chạy baseline**: Trong log mới nhất, 5/5 case baseline đã có đủ `CHATBOT_CASE_START` và `CHATBOT_CASE_END`. Độ đúng/sai của câu trả lời vẫn chưa thể chấm chính xác từ log vì hệ thống chưa lưu nội dung response, chỉ lưu latency và token.
- **Trạng thái cài đặt Agent**: Các function tool và tool specification đã được cài đặt; vòng lặp ReAct trong `src/agent/agent.py` vẫn đang là skeleton và cần hoàn thiện trước khi chấm điểm cuối.
- **Kết quả chính**: Project thể hiện khác biệt cốt lõi giữa chatbot và agent: chatbot dự đoán dựa trên xác suất ngôn ngữ, còn agent cần parse `Action`, gọi một Python function được phê duyệt, rồi trả lời dựa trên `Observation` trả về.

---

## 2. Kiến Trúc Hệ Thống Và Tooling

### 2.1 Cài Đặt Vòng Lặp ReAct

Vòng lặp ReAct dự kiến hoạt động như sau:

```text
User request
  -> LLM nhận system prompt có danh sách tool
  -> LLM sinh Thought và Action
  -> Python parser tách tên tool và tham số JSON
  -> Python gọi function thông qua tool_functions[tool_name](**args)
  -> Tool trả về dữ liệu có cấu trúc
  -> Kết quả được gắn vào prompt như Observation
  -> LLM lặp tiếp hoặc sinh Final Answer
```

Class `ReActAgent` hiện tại đã có cấu trúc chính: constructor, hàm tạo system prompt, `run()`, và `_execute_tool()`. Các phần quan trọng còn thiếu là parse `Action`, validate tham số JSON, dispatch thật sự đến `tool_functions`, gắn thêm `Observation`, và dừng vòng lặp khi xuất hiện `Final Answer:`.

### 2.2 Danh Sách Tool

| Tên Tool | Định Dạng Input | Mục Đích Sử Dụng |
| :--- | :--- | :--- |
| `search_flights` | Keyword arguments: `origin`, `destination`, `date`, `cabin`, `budget`, `carrier` | Tìm các chuyến bay phù hợp trong cơ sở dữ liệu cục bộ. |
| `get_fare_rules` | Keyword argument: `flight_id` | Kiểm tra khả năng hoàn vé, phí đổi vé và hành lý miễn phí. |
| `check_seat_availability` | Keyword arguments: `flight_id`, `passenger_count` | Kiểm tra còn đủ ghế cho số hành khách yêu cầu hay không. |
| `calculate_total_price` | Keyword arguments: `flight_id`, `passenger_count`, `add_ons` | Tính giá gốc, thuế, dịch vụ thêm và tổng tiền cuối cùng. |
| `create_booking` | Keyword arguments: `flight_id`, `passenger_info`, `add_ons` | Tạo booking giả lập và trả về mã xác nhận. |

### 2.3 LLM Provider Đã Sử Dụng

- **Primary**: Gemini, model `gemini-2.5-flash`, theo log telemetry hiện có.
- **Secondary (Backup)**: OpenAI, model mặc định `gpt-4o` thông qua `OpenAIProvider`.

---

## 3. Telemetry Và Bảng Đánh Giá Hiệu Năng

Telemetry được ghi dưới dạng JSON lines thông qua `src/telemetry/logger.py`. Log chạy ngày 2026-06-01 hiện có một lượt baseline chatbot hoàn chỉnh với 5 case bằng Gemini.

- **Số case baseline đã log hoàn thành**: 5
- **Độ trễ trung bình**: 6824 ms
- **Độ trễ trung vị (P50)**: 5894 ms
- **Độ trễ lớn nhất**: 10580 ms
- **Số token trung bình mỗi task**: 1107 total tokens
- **Tổng chi phí ước tính của lượt chạy mới nhất**: $0.05536 theo công thức mock trong `PerformanceTracker`

| Case | Provider | Model | Độ Trễ | Tổng Token | Chi Phí Ước Tính |
| :--- | :--- | :--- | ---: | ---: | ---: |
| 1 | Gemini | `gemini-2.5-flash` | 10422 ms | 1358 | $0.01358 |
| 2 | Gemini | `gemini-2.5-flash` | 10580 ms | 1879 | $0.01879 |
| 3 | Gemini | `gemini-2.5-flash` | 4116 ms | 716 | $0.00716 |
| 4 | Gemini | `gemini-2.5-flash` | 5894 ms | 1047 | $0.01047 |
| 5 | Gemini | `gemini-2.5-flash` | 3110 ms | 536 | $0.00536 |

Telemetry hiện tại hữu ích cho việc đo latency, token count và mock cost. Bước cải tiến tiếp theo nên thêm metric riêng cho agent: số vòng lặp, tên tool được gọi, latency của tool, số lỗi parser, số lần gọi tool không tồn tại và số lần dừng do vượt `max_steps`.

---

## 4. Phân Tích Nguyên Nhân Gốc Rễ - Failure Traces

### Case Study: Chatbot Trả Lời Không Được Ground Bằng Tool

- **Input**: `Bay HAN to SGN ngay 2026-06-12. Gia re nhat la bao nhieu va tong chi phi voi 10% thue?`
- **Observation**: Chatbot baseline nhận chỉ dẫn "Answer directly without using tools." Vì vậy nó không có quyền truy cập đáng tin cậy vào `FLIGHTS`, không thể sắp xếp các chuyến bay thật trong `flight_data.py`, và không đảm bảo chọn đúng vé rẻ nhất hoặc tính đúng thuế.
- **Root Cause**: Thiết kế baseline cố tình loại bỏ tool access, nên model buộc phải đoán hoặc suy diễn. Điều này phù hợp để so sánh, nhưng không đáng tin cậy cho tác vụ giao dịch vé máy bay.
- **Fix**: Sử dụng vòng lặp ReAct với `search_flights`, sau đó gọi `calculate_total_price`. Với input này, đường đi đúng là tìm chuyến bay economy rẻ nhất từ HAN -> SGN ngày 2026-06-12, sau đó tính tổng tiền có thuế từ `flight_id` đã chọn.

### Case Study: Agent Skeleton Chưa Thực Thi Tool

- **Input**: Bất kỳ yêu cầu nào cần tool, ví dụ `Toi can ve HAN -> SGN ngay 2026-06-12, hanh ly 20kg, ngan sach 2.3 trieu.`
- **Observation**: `ReActAgent.run()` hiện chỉ tăng biến `steps` và trả về `Not implemented. Fill in the TODOs!`; `_execute_tool()` trả về chuỗi placeholder thay vì dispatch đến function thật.
- **Root Cause**: Tầng parser và dispatch chưa hoàn thiện. LLM có thể được prompt để sinh `Action`, nhưng Python vẫn phải tách tên function, validate tham số, và gọi function nằm trong whitelist.
- **Fix**: Import `tool_functions`, parse `Action: tool_name({...})`, load JSON args, gọi `tool_functions[tool_name](**args)`, thêm kết quả thành `Observation`, và tiếp tục cho đến khi có `Final Answer:`.

---

## 5. Ablation Studies Và Thử Nghiệm

### Thử Nghiệm 1: Baseline Prompt vs ReAct Prompt

- **Khác biệt**: Baseline prompt yêu cầu trả lời trực tiếp không dùng tool. ReAct prompt liệt kê tool sẵn có và bắt buộc format `Thought`, `Action`, `Observation`, và `Final Answer`.
- **Kết quả**: Baseline đơn giản hơn và chỉ cần một lần gọi LLM, nhưng không đảm bảo đúng sự thật. Thiết kế ReAct tốn thêm overhead, nhưng có thể ground câu trả lời bằng các Python function có tính xác định.

### Thử Nghiệm 2: Placeholder Dispatch vs Whitelisted Dispatch

- **Khác biệt**: Placeholder hiện tại trả về `Result of {tool_name}`. Tầng dispatch dùng cho production nên dùng dictionary whitelist: `tool_functions[tool_name](**args)`.
- **Kết quả**: Placeholder dispatch không thể giải quyết task thật. Whitelisted dispatch ánh xạ text do model sinh ra sang các Python function được phê duyệt một cách an toàn, không cần dùng `eval()` nguy hiểm.

### Thử Nghiệm 3: Chatbot vs Agent

| Case | Kết Quả Chatbot | Kết Quả Agent Kỳ Vọng | Bên Tốt Hơn |
| :--- | :--- | :--- | :--- |
| Vé rẻ nhất HAN -> SGN và thuế 10% | Có khả năng đoán hoặc nêu giả định | Gọi `search_flights`, chọn vé rẻ nhất, gọi `calculate_total_price` | Agent |
| HAN -> SGN có hành lý 20kg và ngân sách 2.3M | Có thể bỏ sót logic hành lý/add-on | Lọc chuyến bay, kiểm tra fare rules/add-ons, tính tổng tiền | Agent |
| Chỉ Vietnam Airlines, HAN -> DAD buổi sáng | Có thể trả lời theo giả định | Gọi `search_flights` với `carrier=VietnamAirlines` | Agent |
| Hai vé ưu tiên hoàn/đổi | Có thể bỏ qua fare rules | Gọi `get_fare_rules`, kiểm tra ghế, tính tổng cho 2 khách | Agent |
| Chuyến sớm nhất SGN -> HAN | Có thể chọn giờ có vẻ hợp lý nhưng không chắc | Gọi `search_flights` và sắp xếp theo giờ khởi hành | Agent |

---

## 6. Đánh Giá Mức Độ Sẵn Sàng Production

- **Security**: Thực thi tool phải dùng whitelist dictionary như `tool_functions`; không dùng `eval()` trên text do LLM sinh ra.
- **Guardrails**: Giữ `max_steps` để tránh vòng lặp vô hạn và log mọi lỗi parser hoặc yêu cầu tool không tồn tại.
- **Input Validation**: Validate tham số JSON trước khi dispatch function. Các field bắt buộc như `origin`, `destination`, `date`, và `flight_id` cần được kiểm tra rõ ràng.
- **Observability**: Mở rộng telemetry với latency của tool, số vòng lặp, trạng thái cuối, loại lỗi parser và `flight_id` đã chọn.
- **Reliability**: Thêm few-shot examples vào system prompt để model sinh tham số JSON đúng format nghiêm ngặt hơn.
- **Scaling**: Với workflow lớn hơn, có thể chuyển từ manual loop sang graph-based orchestrator như LangGraph, tách riêng các node planning, tool execution, validation và final response.

---
