update public.instructors
set timezone = 'Europe/Moscow'
where timezone is null
   or timezone = ''
   or timezone = 'Asia/Irkutsk';
