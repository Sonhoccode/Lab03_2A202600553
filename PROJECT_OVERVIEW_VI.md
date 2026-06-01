# De tai: Agent dat ve may bay (du lieu gia lap)

## 1. Mo ta de tai
De tai xay dung mot tro ly dat ve may bay dua tren du lieu gia lap. Muc tieu la so sanh chatbot goi LLM 1 lan voi ReAct agent co kha nang giai quyet bai toan nhieu buoc: tim chuyen bay, kiem tra dieu kien ve, hanh ly, tinh tong gia, va tao dat cho. Du lieu gia lap giup thu nghiem on dinh va tai lap duoc.

## 2. Ly do chon de tai
- Dat ve may bay la bai toan nhieu rang buoc, phu hop de the hien han che cua chatbot va loi the cua agent.
- Du lieu gia lap giam phu thuoc vao API ben ngoai, de kiem thu va so sanh ket qua.
- Co the do luong ro rang bang so buoc, do tre, token, va ty le loi.

## 3. Kien truc tong quan
- Chatbot baseline: goi LLM 1 lan, khong dung tool.
- ReAct agent: chu trinh Thought -> Action -> Observation.
- Lop tool: cac ham mo phong tim ve, quy dinh, ghe trong, gia, dat cho.
- Telemetry: log JSON phuc vu theo doi va phan tich loi.

## 4. Luong hoat dong
### 4.1 Chatbot Baseline
1. Nguoi dung nhap yeu cau.
2. LLM tra loi truc tiep, khong goi tool.
3. Log ghi lai latency va token.
4. Khi cau hoi co nhieu rang buoc, chatbot de tra loi sai hoac thieu.

### 4.2 ReAct Agent
1. Nguoi dung nhap yeu cau.
2. LLM tra ve Thought va Action JSON.
3. Agent goi tool va thu Observation.
4. Lap lai den khi co Final Answer hoac het buoc.
5. Tat ca buoc duoc ghi log.

## 5. He thong tool va du lieu gia lap
- search_flights: loc theo diem di, diem den, ngay, hang ve, ngan sach, hang bay.
- get_fare_rules: tra ve quy dinh doi/hoan va hanh ly.
- check_seat_availability: kiem tra ghe con.
- calculate_total_price: tinh tong gia (gia goc + phu thu + thue).
- create_booking: tao ma dat cho.

Du lieu gia lap gom lich bay, gia, hanh ly, phu thu, so ghe, co tinh lap lai.

## 6. So sanh chatbot va agent
### 6.1 Chatbot
- Uu diem: nhanh, re, phu hop cau hoi don gian.
- Nhuoc diem: khong xu ly tot rang buoc nhieu buoc, de tu suy dien sai gia hoac dieu kien.

### 6.2 ReAct Agent
- Uu diem: dung tool de xac minh, xu ly duoc yeu cau phuc tap, co the kiem tra dieu kien.
- Nhuoc diem: do tre cao hon, ton token hon, de loi neu prompt hoac schema khong ro rang.

## 7. Ket qua mong doi
- Chatbot manh trong Q&A don gian nhung yeu trong bai toan nhieu rang buoc.
- Agent chinh xac hon nho tool, doi lai ton nhieu buoc va chi phi.
- Telemetry giup tim ra loi (JSON parse, tool hallucination, quota/503) va cai thien agent v2.
